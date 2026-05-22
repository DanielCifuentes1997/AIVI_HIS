from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

from sqlalchemy.future import select
from app.infrastructure.database import AsyncSessionLocal
from app.domain.models import User, Patient, ClinicalRecord, Prescription, Appointment
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

            new_user = User(
                email=data.email,
                hashed_password="mock_password_123",
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
                    hashed_password="mock_password_123",
                    role="doctor",
                    first_name="Médico",
                    last_name="De Prueba"
                )
                session.add(doctor)
                await session.flush()
            
            real_doctor_id = doctor.id

            new_record = ClinicalRecord(
                patient_id=data.patient_id,
                doctor_id=real_doctor_id,
                record_data=data.record_data
            )
            session.add(new_record)

            if data.prescription_data:
                new_prescription = Prescription(
                    patient_id=data.patient_id,
                    doctor_id=real_doctor_id,
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
                    doctor_id=real_doctor_id,
                    date_time=dt,
                    status="scheduled",
                    recommendations=data.appointment.get("recommendations")
                )
                session.add(new_appointment)

            return {"status": "success", "message": "Modulo Medico conectado exitosamente con el Paciente"}

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
        
        orders = []
        for p in prescriptions:
            orders.append({
                "id": p.id,
                "patient_id": p.patient_id,
                "prescription_data": p.prescription_data,
                "delivery_status": p.delivery_status,
                "created_at": p.created_at.isoformat()
            })
        return orders

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