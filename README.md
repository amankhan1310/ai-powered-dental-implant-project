# AI-Powered Dental Implant Detection System

An end-to-end AI-powered computer vision system designed to detect dental implants from dental X-ray images using transformer-based object detection models. The application automates implant identification, generates confidence-based predictions, and produces downloadable PDF diagnostic reports.

This project integrates a React frontend, Python backend APIs, MongoDB storage, and a Roboflow-hosted RF-DETR model to deliver a full-stack AI healthcare solution.

## Overview

Dental implant analysis from radiographic images typically requires manual inspection by dental specialists. This project automates the detection process using advanced computer vision and transformer-based object detection techniques.

Users can upload dental X-ray images, trigger AI inference through a deployed Roboflow model, visualize detected implants using bounding boxes, and generate structured diagnostic reports.

## Features

* AI-powered dental implant detection
* Transformer-based object detection (RF-DETR Nano)
* Dental X-ray image preprocessing
* Confidence score generation
* Real-time image upload and analysis
* Bounding box visualization
* Automated PDF report generation
* Full-stack frontend-backend API integration
* Historical prediction storage using MongoDB

## Tech Stack

### Frontend

* React.js
* JavaScript
* HTML5
* CSS3
* Tailwind CSS

### Backend

* Python
* FastAPI
* REST APIs
* PDF report generation
* MongoDB

### AI / Machine Learning

* Roboflow RF-DETR (Nano)
* Transformer-based object detection
* Hosted inference via Roboflow API

## Dataset

* Total Images: 2829
* Training Images: 2478
* Validation Images: 230
* Test Images: 121

### Preprocessing

* Image resizing (512×512)
* Grayscale conversion
* Adaptive contrast enhancement
* Image normalization

## System Architecture

1. User uploads dental X-ray image
2. Frontend sends image to backend API
3. Backend preprocesses image
4. Roboflow RF-DETR model performs inference
5. Detection results returned with confidence scores
6. Bounding boxes rendered on frontend
7. PDF diagnostic report generated

## AI Model

This project uses:

**Roboflow RF-DETR (Nano)** transformer-based object detection model.

Model ID:
`dental-implants-2.0-dfzkn/2`

The model is deployed via Roboflow and integrated using API-based inference workflows.

## Core Functionalities

### Dental Implant Detection

* Detects implants from dental radiographs
* Highlights implant regions visually
* Generates confidence-based predictions

### Automated Reporting

Generates downloadable PDF reports containing:

* Detection status
* Confidence score
* Detection summary
* Visual analysis output

## Engineering Challenges Solved

* Real-time AI inference integration
* Medical image preprocessing optimization
* Frontend bounding box rendering
* Backend API debugging
* PDF report generation pipeline
* Migration from Emergent hosted environment to standalone localhost deployment

## Future Enhancements

* Multi-condition dental disease detection
* AI-assisted treatment recommendations
* Cloud-based patient records
* Medical image segmentation
* Clinical dashboard integration

## Author

**Aman Yahya Khan**
AI / ML Engineer| Computer Vision | Full-Stack AI Development
Pune, Maharashtra, India

GitHub: github.com/amankhan1310
