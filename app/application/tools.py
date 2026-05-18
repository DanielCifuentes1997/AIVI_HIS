from sqlalchemy.future import select
# Analizado: Añadimos Prescription a los modelos importados del dominio
from app.domain.models import Appointment, ClinicalRecord, Prescription
from app.infrastructure.database import AsyncSessionLocal

async def get_patient_appointments(patient_id: str) -> str:
    """Busca y devuelve la lista de citas medicas programadas para un paciente utilizando su ID."""
    async with AsyncSessionLocal() as session:
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

async def get_clinical_summary(patient_id: str) -> str:
    """Consulta y devuelve un resumen de la historia clinica, diagnosticos y alergias del paciente utilizando su ID."""
    async with AsyncSessionLocal() as session:
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

# Herramienta nueva diseñada con base en el flujo de negocio y estructura JSONB real
async def get_patient_prescriptions(patient_id: str) -> str:
    """Consulta las recetas medicas y medicamentos asignados al paciente utilizando su ID. Muestra su estado de autorizacion."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Prescription).where(Prescription.patient_id == patient_id)
        )
        prescriptions = result.scalars().all()
        if not prescriptions:
            return "No tienes fórmulas médicas o medicamentos registrados en el sistema."
        
        response = "Aquí están tus medicamentos y recetas en el sistema:\n"
        for rx in prescriptions:
            data = rx.prescription_data
            meds = data.get("medications", [])
            
            response += f"- Receta ID: {rx.id}. Estado de entrega: '{rx.delivery_status}'.\n"
            response += "  Medicamentos incluidos:\n"
            for m in meds:
                response += f"  * {m.get('name')}: {m.get('dose')} - Frecuencia: {m.get('frequency')}\n"
        return response