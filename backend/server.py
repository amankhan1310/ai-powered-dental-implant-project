from fastapi import FastAPI, APIRouter, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
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
import tempfile

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY")
ROBOFLOW_MODEL_ID = os.environ.get("ROBOFLOW_MODEL_ID")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


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


@app.on_event("startup")
async def startup():
    logging.info("Application started successfully")


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
        storage_path = f"{unique_id}.{ext}"
        local_path = os.path.join(UPLOAD_DIR, storage_path)

        with open(local_path, "wb") as f:
            f.write(file_data)

        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp_file:
            tmp_file.write(file_data)
            tmp_path = tmp_file.name

        roboflow_client = InferenceHTTPClient(
            api_url="https://detect.roboflow.com",
            api_key=ROBOFLOW_API_KEY
        )

        inference_result = roboflow_client.infer(
            tmp_path,
            model_id=ROBOFLOW_MODEL_ID
        )

        os.unlink(tmp_path)

        predictions = inference_result.get("predictions", [])

        print("\n========== RAW ROBOFLOW RESPONSE ==========")
        print(inference_result)
        print("===========================================\n")

        implant_detected = False
        max_confidence = 0.0
        detections = []

        for pred in predictions:
            print("PREDICTION:", pred)

            class_name = str(pred.get("class", "")).lower()
            confidence = float(pred.get("confidence", 0))

            detection = Detection(
                x=float(pred.get("x", 0)),
                y=float(pred.get("y", 0)),
                width=float(pred.get("width", 0)),
                height=float(pred.get("height", 0)),
                confidence=confidence,
                class_name=class_name
            )
            detections.append(detection)

            # Debug mode: any prediction >25% counts
            if confidence > 0.25:
                implant_detected = True
                max_confidence = max(max_confidence, confidence)

        print("Implant detected =", implant_detected)
        print("Detections count =", len(detections))

        prediction_result = PredictionResult(
            image_url=f"/uploads/{storage_path}",
            storage_path=storage_path,
            original_filename=file.filename,
            implant_detected=implant_detected,
            confidence=max_confidence if implant_detected else None,
            detections=detections,
            raw_response=inference_result
        )

        doc = prediction_result.model_dump()
        doc["timestamp"] = doc["timestamp"].isoformat()
        doc["detections"] = [d.model_dump() for d in detections]

        await db.predictions.insert_one(doc)

        return prediction_result

    except Exception as e:
        logging.error(f"Error during detection: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@api_router.get("/history")
async def get_history():
    predictions = await db.predictions.find({}, {"_id": 0}).sort(
        "timestamp", -1
    ).to_list(100)
    return predictions


@api_router.get("/prediction/{prediction_id}")
async def get_prediction(prediction_id: str):
    prediction = await db.predictions.find_one(
        {"id": prediction_id},
        {"_id": 0}
    )

    if not prediction:
        raise HTTPException(status_code=404, detail="Prediction not found")

    return prediction


@api_router.get("/prediction/{prediction_id}/pdf")
async def get_prediction_pdf(prediction_id: str):
    from fpdf import FPDF
    import io

    prediction = await db.predictions.find_one(
        {"id": prediction_id},
        {"_id": 0}
    )

    if not prediction:
        raise HTTPException(status_code=404, detail="Prediction not found")

    pdf = FPDF()
    pdf.add_page()

    # Title
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 12, "Dental Implant Detection Report", ln=True)

    pdf.ln(8)

    # Metadata
    pdf.set_font("Helvetica", "", 12)

    pdf.cell(0, 10, f"Filename: {prediction['original_filename']}", ln=True)

    pdf.cell(
        0,
        10,
        f"Implant Detected: {'YES' if prediction['implant_detected'] else 'NO'}",
        ln=True
    )

    confidence = prediction.get("confidence")
    confidence_text = (
        f"{confidence * 100:.2f}%"
        if confidence is not None else "N/A"
    )

    pdf.cell(0, 10, f"Confidence: {confidence_text}", ln=True)

    pdf.cell(
        0,
        10,
        f"Detections Count: {len(prediction.get('detections', []))}",
        ln=True
    )

    pdf.ln(8)

    # Clinical Summary
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "Clinical Summary", ln=True)

    pdf.set_font("Helvetica", "", 12)

    if prediction["implant_detected"]:
        summary = (
            "Dental implants were detected in the uploaded radiograph. "
            "Clinical evaluation is recommended to verify implant "
            "position, angulation, and surrounding bone quality."
        )
    else:
        summary = (
            "No dental implants were detected in the uploaded radiograph."
        )

    pdf.multi_cell(0, 8, summary)

    # Return PDF
    pdf_bytes = bytes(pdf.output(dest="S"))
    buf = io.BytesIO(pdf_bytes)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=dental_report.pdf"
        }
    )


app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()