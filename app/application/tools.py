from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.domain.models import Appointment, ClinicalRecord, Patient

async def get_patient_appointments(session: AsyncSession, patient_id: str):
    result = await session.execute(
        select(Appointment).where(Appointment.patient_id == patient_id)
    )
    appointments = result.scalars().all()
    if not appointments:
        return "No tienes citas programadas en este momento."
    
    response = "Aquí están tus citas programadas:\n"
    for appt in appointments:
        response += f"- Cita el {appt.date_time.strftime('%Y-%m-%d %H:%M')}. Estado: {appt.status}. Recomendaciones: {appt.recommendations}\n"
    return response

async def get_clinical_summary(session: AsyncSession, patient_id: str):
    result = await session.execute(
        select(ClinicalRecord).where(ClinicalRecord.patient_id == patient_id)
    )
    records = result.scalars().all()
    if not records:
        return "No encontré ninguna historia clínica registrada."
    
    response = "Este es el resumen de tu historia clínica:\n"
    for record in records:
        data = record.record_data
        response += f"Diagnóstico: {data.get('diagnosis', 'No especificado')}. Notas: {data.get('notes', '')}. Alergias: {', '.join(data.get('allergies', []))}\n"
    return response