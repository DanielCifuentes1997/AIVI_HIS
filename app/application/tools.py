import datetime
from sqlalchemy.future import select
from app.domain.models import Appointment, ClinicalRecord, Prescription, User
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

# --- NUEVA HERRAMIENTA: AGENDAR CITA ---
async def agendar_cita(patient_id: str, fecha_hora: str) -> str:
    """
    Agenda una nueva cita médica para el paciente.
    fecha_hora debe tener el formato estricto: 'YYYY-MM-DD HH:MM:00'.
    """
    async with AsyncSessionLocal() as session:
        async with session.begin(): # Asegura el commit automático
            # 1. Regla de Negocio: Validar si ya tiene cita
            result = await session.execute(
                select(Appointment).where(Appointment.patient_id == patient_id, Appointment.status == "scheduled")
            )
            if result.scalars().first():
                return "FALLO: El paciente ya tiene una cita agendada. Solo se permite una por día."

            # 2. Buscar al médico del sistema
            doc_result = await session.execute(select(User).where(User.role == "doctor"))
            doctor = doc_result.scalars().first()
            if not doctor:
                return "FALLO: No hay médicos disponibles en el sistema."

            # 3. Parsear fecha y guardar cita
            try:
                dt = datetime.datetime.strptime(fecha_hora, "%Y-%m-%d %H:%M:%S")
                new_appointment = Appointment(
                    patient_id=patient_id,
                    doctor_id=doctor.id,
                    date_time=dt,
                    status="scheduled",
                    recommendations="Cita agendada mediante asistente de voz AiVi."
                )
                session.add(new_appointment)
                return f"ÉXITO: Cita agendada correctamente para el {fecha_hora}."
            except ValueError:
                return "FALLO: Formato de fecha inválido. Usa 'YYYY-MM-DD HH:MM:00'."