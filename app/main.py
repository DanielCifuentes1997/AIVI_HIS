import os
import hashlib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
import bcrypt
import math

from sqlalchemy.future import select
from app.infrastructure.database import AsyncSessionLocal
from app.domain.models import User, Patient, ClinicalRecord, Prescription, Appointment, ElectronicSignature
from app.infrastructure.config import settings
from app.presentation.websocket import router as websocket_router


app = FastAPI(title="AiVi MVP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(websocket_router)

class PatientCreateSchema(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    document_id: str
    blood_type: Optional[str] = None
    address: Optional[str] = None
    biometric_landmarks: Optional[Any] = None

class ConsultationSchema(BaseModel):
    patient_id: str
    record_data: Dict[str, Any]
    prescription_data: Optional[Dict[str, Any]] = None
    appointment: Optional[Dict[str, Any]] = None

class OrderStatusUpdateSchema(BaseModel):
    delivery_status: str

class SignatureSchema(BaseModel):
    jws_token: str
    liveness_status: str

class BiometricLoginSchema(BaseModel):
    biometric_landmarks: list

def calculate_euclidean_distance(points1, points2):
    if not points1 or not points2 or len(points1) != len(points2):
        return float('inf')
    
    total_distance = 0
    for p1, p2 in zip(points1, points2):
        dx = p1.get('x', 0) - p2.get('x', 0)
        dy = p1.get('y', 0) - p2.get('y', 0)
        dz = p1.get('z', 0) - p2.get('z', 0)
        total_distance += math.sqrt(dx*dx + dy*dy + dz*dz)
    
    return total_distance / len(points1)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/api/patients")
async def create_patient(data: PatientCreateSchema):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            email_check = await session.execute(select(User).where(User.email == data.email))
            if email_check.scalars().first():
                raise HTTPException(status_code=400, detail="El correo ya esta registrado")

            doc_check = await session.execute(select(Patient).where(Patient.document_id == data.document_id))
            if doc_check.scalars().first():
                raise HTTPException(status_code=400, detail="El documento de identidad ya esta registrado")

            password_bytes = settings.DEFAULT_PATIENT_PASSWORD.encode('utf-8')
            hashed_pw = bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode('utf-8')
            new_user = User(
                email=data.email,
                hashed_password=hashed_pw,
                role="patient",
                first_name=data.first_name,
                last_name=data.last_name,
                phone=data.phone
            )
            session.add(new_user)
            await session.flush()

            new_patient = Patient(
                user_id=new_user.id,
                document_id=data.document_id,
                blood_type=data.blood_type,
                address=data.address,
                biometric_landmarks=data.biometric_landmarks
            )
            session.add(new_patient)
            return {"status": "success", "patient_id": new_patient.id, "user_id": new_user.id}

@app.post("/api/medical-consultation")
async def create_medical_consultation(data: ConsultationSchema):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            patient_check = await session.execute(select(Patient).where(Patient.id == data.patient_id))
            if not patient_check.scalars().first():
                raise HTTPException(status_code=404, detail="Paciente no encontrado")

            mock_doctor_email = "medico@aivi.com"
            doctor_check = await session.execute(select(User).where(User.email == mock_doctor_email))
            doctor = doctor_check.scalars().first()
            
            if not doctor:
                doctor = User(
                    email=mock_doctor_email,
                    hashed_password=bcrypt.hashpw(settings.DEFAULT_DOCTOR_PASSWORD.encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
                    role="doctor",
                    first_name="Médico",
                    last_name="De Prueba"
                )
                session.add(doctor)
                await session.flush()
            
            new_record = ClinicalRecord(
                patient_id=data.patient_id,
                doctor_id=doctor.id,
                record_data=data.record_data
            )
            session.add(new_record)

            if data.prescription_data:
                new_prescription = Prescription(
                    patient_id=data.patient_id,
                    doctor_id=doctor.id,
                    delivery_status="pending",
                    prescription_data=data.prescription_data
                )
                session.add(new_prescription)

            if data.appointment:
                try:
                    dt = datetime.fromisoformat(data.appointment["date_time"])
                except ValueError:
                    raise HTTPException(status_code=400, detail="Formato de fecha invalido")

                new_appointment = Appointment(
                    patient_id=data.patient_id,
                    doctor_id=doctor.id,
                    date_time=dt,
                    status="scheduled",
                    recommendations=data.appointment.get("recommendations")
                )
                session.add(new_appointment)

            return {"status": "success", "message": "Consulta guardada"}

@app.get("/api/patients/{patient_id}/prescriptions")
async def get_patient_prescriptions(patient_id: str):
    async with AsyncSessionLocal() as session:
        stmt = select(Prescription).where(Prescription.patient_id == patient_id)
        result = await session.execute(stmt)
        prescriptions = result.scalars().all()
        return [{
            "id": p.id,
            "prescription_data": p.prescription_data,
            "delivery_status": p.delivery_status,
            "created_at": p.created_at.isoformat()
        } for p in prescriptions]

@app.get("/api/farmacia/orders")
async def get_pharmacy_orders():
    async with AsyncSessionLocal() as session:
        stmt = select(Prescription).where(Prescription.delivery_status != "pending")
        result = await session.execute(stmt)
        prescriptions = result.scalars().all()
        return [{
            "id": p.id,
            "patient_id": p.patient_id,
            "prescription_data": p.prescription_data,
            "delivery_status": p.delivery_status,
            "created_at": p.created_at.isoformat()
        } for p in prescriptions]

@app.patch("/api/farmacia/orders/{order_id}")
async def update_order_status(order_id: str, data: OrderStatusUpdateSchema):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(Prescription).where(Prescription.id == order_id)
            result = await session.execute(stmt)
            prescription = result.scalars().first()
            if not prescription:
                raise HTTPException(status_code=404, detail="Orden no encontrada")
            prescription.delivery_status = data.delivery_status
            return {"status": "success", "updated_status": prescription.delivery_status}

@app.post("/api/prescriptions/{order_id}/sign")
async def sign_prescription(order_id: str, data: SignatureSchema):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(Prescription).where(Prescription.id == order_id)
            result = await session.execute(stmt)
            prescription = result.scalars().first()
            
            if not prescription:
                raise HTTPException(status_code=404, detail="Orden no encontrada")
            
            if prescription.delivery_status != "pending":
                raise HTTPException(status_code=400, detail="Esta receta ya fue firmada o procesada")

            rx_data_str = str(prescription.prescription_data)
            rx_hash = hashlib.sha256(rx_data_str.encode('utf-8')).hexdigest()

            new_signature = ElectronicSignature(
                prescription_id=prescription.id,
                patient_id=prescription.patient_id,
                rx_hash=rx_hash,
                liveness_status=data.liveness_status,
                jws_token=data.jws_token
            )
            session.add(new_signature)

            prescription.delivery_status = "autorizada"
            
            return {"status": "success", "message": "Firma electrónica validada. Medicamento autorizado."}

@app.post("/api/auth/biometric")
async def biometric_login(data: BiometricLoginSchema):
    live_landmarks = data.biometric_landmarks
    if not live_landmarks or len(live_landmarks) == 0:
        raise HTTPException(status_code=400, detail="No se detectaron puntos faciales")

    async with AsyncSessionLocal() as session:
        stmt = select(Patient, User).join(User, Patient.user_id == User.id)
        result = await session.execute(stmt)
        records = result.all()

        best_match = None
        lowest_distance = float('inf')
        
        THRESHOLD = 0.15 

        for patient, user in records:
            stored_landmarks = patient.biometric_landmarks
            
            if not stored_landmarks or isinstance(stored_landmarks, dict):
                continue
            if len(stored_landmarks) > 0 and 'categoryName' in stored_landmarks[0]:
                continue
            
            dist = calculate_euclidean_distance(live_landmarks, stored_landmarks)
            
            # 2. Espía en la terminal para ver el número exacto
            print(f"Probando con paciente {user.first_name}... Distancia: {dist}")
            
            if dist < lowest_distance:
                lowest_distance = dist
                best_match = (patient, user)

        print(f"--- MEJOR COINCIDENCIA FINAL: {lowest_distance} ---")

        if best_match and lowest_distance < THRESHOLD:
            matched_patient, matched_user = best_match
            return {
                "status": "success", 
                "patient_id": matched_patient.id,
                "first_name": matched_user.first_name,
                "distance": lowest_distance
            }
        
        raise HTTPException(status_code=401, detail="Rostro no reconocido o no registrado en el sistema")