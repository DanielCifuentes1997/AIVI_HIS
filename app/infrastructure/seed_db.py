import asyncio
from datetime import datetime, timedelta
from app.infrastructure.database import AsyncSessionLocal
from app.domain.models import User, Patient, ClinicalRecord, Appointment, Prescription

async def seed_data():
    async with AsyncSessionLocal() as session:
        doc_user = User(email="doctor@aivi.com", hashed_password="hashed_pwd", role="doctor")
        patient_user = User(email="elena@aivi.com", hashed_password="hashed_pwd", role="patient")
        
        session.add_all([doc_user, patient_user])
        await session.flush()

        patient_profile = Patient(
            user_id=patient_user.id,
            document_id="123456789",
            blood_type="O+",
            address="Calle 123, Armenia, Quindío",
            biometric_landmarks={}
        )
        session.add(patient_profile)
        await session.flush()

        record = ClinicalRecord(
            patient_id=patient_profile.id,
            doctor_id=doc_user.id,
            record_data={
                "diagnosis": "Hipertensión Arterial Controlada",
                "notes": "Paciente acude a control de rutina. Presión arterial estable. Continuar medicación.",
                "allergies": ["Penicilina"]
            }
        )
        
        appointment = Appointment(
            patient_id=patient_profile.id,
            doctor_id=doc_user.id,
            date_time=datetime.utcnow() + timedelta(days=2),
            status="scheduled",
            recommendations="Llegar 15 minutos antes. Asistir en ayunas."
        )

        prescription = Prescription(
            patient_id=patient_profile.id,
            doctor_id=doc_user.id,
            delivery_status="pending",
            prescription_data={
                "medications": [
                    {"name": "Losartán", "dose": "50mg", "frequency": "1 cada 12 horas"}
                ]
            }
        )

        session.add_all([record, appointment, prescription])
        await session.commit()

if __name__ == "__main__":
    asyncio.run(seed_data())