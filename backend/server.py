from fastapi import FastAPI, APIRouter, File, UploadFile, HTTPException
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from inference_sdk import InferenceHTTPClient
import requests
import tempfile
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

ROBOFLOW_API_KEY = os.environ.get('ROBOFLOW_API_KEY')
ROBOFLOW_MODEL_ID = os.environ.get('ROBOFLOW_MODEL_ID')
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "dental-implant-detector"

storage_key = None

class Detection(BaseModel):
    x: float
    y: float
    width: float
    height: float
    confidence: float
    class_name: str

class PredictionResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    image_url: str
    storage_path: str
    original_filename: str
    implant_detected: bool
    confidence: Optional[float]
    detections: List[Detection]
    raw_response: dict
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    try:
        resp = requests.post(
            f"{STORAGE_URL}/init",
            json={"emergent_key": EMERGENT_LLM_KEY},
            timeout=30
        )
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        logging.info("Storage initialized successfully")
        return storage_key
    except Exception as e:
        logging.error(f"Storage init failed: {e}")
        raise

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str) -> tuple:
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logging.info("Application started successfully")
    except Exception as e:
        logging.error(f"Startup failed: {e}")

@api_router.post("/upload-and-detect")
async def upload_and_detect(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    allowed_extensions = ["jpg", "jpeg", "png", "webp", "bmp"]
    
    if ext.lower() not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Invalid file type")
    
    file_data = await file.read()
    
    if len(file_data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")
    
    try:
        unique_id = str(uuid.uuid4())
        storage_path = f"{APP_NAME}/uploads/{unique_id}.{ext}"
        
        result = put_object(
            storage_path,
            file_data,
            file.content_type or "image/jpeg"
        )
        
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp_file:
            tmp_file.write(file_data)
            tmp_path = tmp_file.name
        
        roboflow_client = InferenceHTTPClient(
            api_url="https://detect.roboflow.com",
            api_key=ROBOFLOW_API_KEY
        )
        
        inference_result = roboflow_client.infer(tmp_path, model_id=ROBOFLOW_MODEL_ID)
        
        os.unlink(tmp_path)
        
        predictions = inference_result.get('predictions', [])
        
        implant_detected = False
        max_confidence = 0.0
        detections = []
        
        for pred in predictions:
            detection = Detection(
                x=pred.get('x', 0),
                y=pred.get('y', 0),
                width=pred.get('width', 0),
                height=pred.get('height', 0),
                confidence=pred.get('confidence', 0),
                class_name=pred.get('class', '')
            )
            detections.append(detection)
            
            if pred.get('class', '').lower() == 'implant_present':
                implant_detected = True
                max_confidence = max(max_confidence, pred.get('confidence', 0))
        
        prediction_result = PredictionResult(
            image_url=f"/api/images/{storage_path}",
            storage_path=storage_path,
            original_filename=file.filename,
            implant_detected=implant_detected,
            confidence=max_confidence if implant_detected else None,
            detections=detections,
            raw_response=inference_result
        )
        
        doc = prediction_result.model_dump()
        doc['timestamp'] = doc['timestamp'].isoformat()
        doc['detections'] = [d.model_dump() for d in detections]
        
        await db.predictions.insert_one(doc)
        
        return prediction_result
        
    except Exception as e:
        logging.error(f"Error during detection: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")

@api_router.get("/images/{path:path}")
async def get_image(path: str):
    try:
        data, content_type = get_object(path)
        return Response(content=data, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=404, detail="Image not found")

@api_router.get("/history")
async def get_history():
    predictions = await db.predictions.find(
        {},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(100)
    
    for pred in predictions:
        if isinstance(pred.get('timestamp'), str):
            pred['timestamp'] = datetime.fromisoformat(pred['timestamp']).isoformat()
    
    return predictions

@api_router.get("/prediction/{prediction_id}")
async def get_prediction(prediction_id: str):
    prediction = await db.predictions.find_one(
        {"id": prediction_id},
        {"_id": 0}
    )
    
    if not prediction:
        raise HTTPException(status_code=404, detail="Prediction not found")
    
    if isinstance(prediction.get('timestamp'), str):
        prediction['timestamp'] = datetime.fromisoformat(prediction['timestamp']).isoformat()
    
    return prediction

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()