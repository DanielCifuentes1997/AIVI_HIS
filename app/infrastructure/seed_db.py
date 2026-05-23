import asyncio
from datetime import datetime, timedelta
from app.infrastructure.database import AsyncSessionLocal
from app.domain.models import User, Patient, ClinicalRecord, Appointment, Prescription

async def seed_data():
    async with AsyncSessionLocal() as session:
        # Añadimos los datos de identidad analizados para el Doctor
        doc_user = User(
            email="doctor@aivi.com", 
            hashed_password="hashed_pwd", 
            role="doctor",
            first_name="Carlos",
            last_name="Mendoza",
            phone="+573001234567"
        )
        session.add(doc_user)
        await session.commit()

if __name__ == "__main__":
    asyncio.run(seed_data())