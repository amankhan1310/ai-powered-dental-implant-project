import requests
import sys
import os
import tempfile
from datetime import datetime
from PIL import Image
import io

class DentalImplantAPITester:
    def __init__(self, base_url="https://implant-vision-1.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.prediction_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {}
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, timeout=60)
                else:
                    headers['Content-Type'] = 'application/json'
                    response = requests.post(url, json=data, headers=headers, timeout=30)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if 'id' in response_data:
                        self.prediction_id = response_data['id']
                        print(f"   Prediction ID: {self.prediction_id}")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response: {response.text[:200]}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def create_test_image(self):
        """Create a simple test image for upload"""
        # Create a simple 200x200 black image
        img = Image.new('RGB', (200, 200), color='black')
        
        # Add some white rectangles to simulate dental structures
        from PIL import ImageDraw
        draw = ImageDraw.Draw(img)
        draw.rectangle([50, 50, 150, 150], fill='white')
        draw.rectangle([75, 75, 125, 125], fill='gray')
        
        # Save to bytes
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        return img_bytes

    def test_upload_and_detect(self):
        """Test image upload and detection"""
        print("\n📤 Creating test image...")
        test_image = self.create_test_image()
        
        files = {
            'file': ('test_dental_xray.jpg', test_image, 'image/jpeg')
        }
        
        success, response = self.run_test(
            "Upload and Detect",
            "POST",
            "upload-and-detect",
            200,
            files=files
        )
        
        if success and response:
            print(f"   Image URL: {response.get('image_url', 'N/A')}")
            print(f"   Implant Detected: {response.get('implant_detected', 'N/A')}")
            print(f"   Confidence: {response.get('confidence', 'N/A')}")
            print(f"   Detections Count: {len(response.get('detections', []))}")
            return True
        return False

    def test_get_history(self):
        """Test getting prediction history"""
        success, response = self.run_test(
            "Get History",
            "GET",
            "history",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   History entries: {len(response)}")
            if response:
                print(f"   Latest entry: {response[0].get('original_filename', 'N/A')}")
            return True
        return False

    def test_get_prediction(self):
        """Test getting specific prediction by ID"""
        if not self.prediction_id:
            print("⚠️  Skipping prediction test - no prediction ID available")
            return True
            
        success, response = self.run_test(
            "Get Prediction by ID",
            "GET",
            f"prediction/{self.prediction_id}",
            200
        )
        
        if success and response:
            print(f"   Prediction ID: {response.get('id', 'N/A')}")
            print(f"   Filename: {response.get('original_filename', 'N/A')}")
            return True
        return False

    def test_get_image(self):
        """Test image retrieval"""
        if not self.prediction_id:
            print("⚠️  Skipping image test - no prediction ID available")
            return True
            
        # First get the prediction to get the image path
        try:
            pred_response = requests.get(f"{self.api_url}/prediction/{self.prediction_id}", timeout=30)
            if pred_response.status_code == 200:
                pred_data = pred_response.json()
                image_url = pred_data.get('image_url', '')
                if image_url.startswith('/api/images/'):
                    image_path = image_url.replace('/api/images/', '')
                    
                    success, _ = self.run_test(
                        "Get Image",
                        "GET",
                        f"images/{image_path}",
                        200
                    )
                    return success
        except Exception as e:
            print(f"❌ Image test failed: {str(e)}")
            
        return False

    def test_invalid_file_upload(self):
        """Test upload with invalid file type"""
        # Create a text file instead of image
        text_content = b"This is not an image file"
        files = {
            'file': ('test.txt', io.BytesIO(text_content), 'text/plain')
        }
        
        success, response = self.run_test(
            "Invalid File Upload",
            "POST",
            "upload-and-detect",
            400,  # Expecting 400 Bad Request
            files=files
        )
        return success

def main():
    print("🦷 Starting Dental Implant Detector API Tests")
    print("=" * 50)
    
    tester = DentalImplantAPITester()
    
    # Test sequence
    tests = [
        ("Upload and Detection", tester.test_upload_and_detect),
        ("Get History", tester.test_get_history),
        ("Get Specific Prediction", tester.test_get_prediction),
        ("Get Image", tester.test_get_image),
        ("Invalid File Upload", tester.test_invalid_file_upload),
    ]
    
    for test_name, test_func in tests:
        try:
            test_func()
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {str(e)}")
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())