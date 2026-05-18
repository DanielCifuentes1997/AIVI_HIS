import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.infrastructure.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)
    
    # Columnas de identidad agregadas con análisis de arquitectura centralizada
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)

    patient_profile = relationship("Patient", back_populates="user", uselist=False)

class Patient(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), unique=True, nullable=False)
    document_id = Column(String, unique=True, index=True, nullable=False)
    blood_type = Column(String)
    address = Column(String)
    biometric_landmarks = Column(JSONB)

    user = relationship("User", back_populates="patient_profile")
    clinical_records = relationship("ClinicalRecord", back_populates="patient")
    appointments = relationship("Appointment", back_populates="patient")
    prescriptions = relationship("Prescription", back_populates="patient")

class ClinicalRecord(Base):
    __tablename__ = "clinical_records"

    id = Column(String, primary_key=True, default=generate_uuid)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(String, ForeignKey("users.id"), nullable=False)
    record_data = Column(JSONB, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="clinical_records")

class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(String, primary_key=True, default=generate_uuid)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(String, ForeignKey("users.id"), nullable=False)
    date_time = Column(DateTime, nullable=False)
    status = Column(String, nullable=False, default="scheduled")
    recommendations = Column(String)

    patient = relationship("Patient", back_populates="appointments")

class Prescription(Base):
    __tablename__ = "prescriptions"

    id = Column(String, primary_key=True, default=generate_uuid)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(String, ForeignKey("users.id"), nullable=False)
    delivery_status = Column(String, nullable=False, default="pending")
    prescription_data = Column(JSONB, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="prescriptions")
    signatures = relationship("ElectronicSignature", back_populates="prescription")

class ElectronicSignature(Base):
    __tablename__ = "electronic_signatures"

    id = Column(String, primary_key=True, default=generate_uuid)
    prescription_id = Column(String, ForeignKey("prescriptions.id"), nullable=False)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False)
    rx_hash = Column(String, nullable=False)
    liveness_status = Column(String, nullable=False)
    jws_token = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    prescription = relationship("Prescription", back_populates="signatures")