/* eslint-disable */
import { useState } from 'react';

export default function MedicoView() {
  const [patientId, setPatientId] = useState('');
  const [recordData, setRecordData] = useState({ weight: '', height: '', reason: '', diagnosis: '' });
  const [appointmentDate, setAppointmentDate] = useState('');
  const [recommendations, setRecommendations] = useState('');
  
  const [medications, setMedications] = useState([{ name: '', dose: '', frequency: '' }]);

  const handleMedChange = (index: number, field: string, value: string) => {
    const newMeds = [...medications];
    newMeds[index] = { ...newMeds[index], [field]: value };
    setMedications(newMeds);
  };

  const addMedication = () => setMedications([...medications, { name: '', dose: '', frequency: '' }]);
  const removeMedication = (index: number) => {
    const newMeds = medications.filter((_, i) => i !== index);
    setMedications(newMeds);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validMeds = medications.filter(m => m.name.trim() !== '');

    const payload = {
      patient_id: patientId,
      record_data: recordData,
      prescription_data: validMeds.length > 0 ? { medications: validMeds } : null,
      appointment: appointmentDate ? { date_time: appointmentDate, recommendations } : null
    };

    try {
      const response = await fetch('http://localhost:8000/api/medical-consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        alert('Consulta guardada. Medicamentos cargados como PENDING.');
        setRecordData({ weight: '', height: '', reason: '', diagnosis: '' });
        setMedications([{ name: '', dose: '', frequency: '' }]);
        setAppointmentDate('');
        setRecommendations('');
      } else {
        alert('Error al guardar consulta.');
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Interfaz Médica (Data Estructurada)</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ border: '1px solid #ccc', padding: '10px' }}>
          <h3>1. Selección de Paciente</h3>
          <input placeholder="UUID del Paciente" required value={patientId} onChange={e => setPatientId(e.target.value)} style={{ padding: '8px', width: '100%' }}/>
        </div>
        
        <div style={{ border: '1px solid #ccc', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3>2. Historia Clínica (JSONB)</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input placeholder="Peso (kg)" value={recordData.weight} onChange={e => setRecordData({...recordData, weight: e.target.value})} style={{ padding: '8px', flex: 1 }}/>
            <input placeholder="Talla (cm)" value={recordData.height} onChange={e => setRecordData({...recordData, height: e.target.value})} style={{ padding: '8px', flex: 1 }}/>
          </div>
          <input placeholder="Motivo de consulta" required value={recordData.reason} onChange={e => setRecordData({...recordData, reason: e.target.value})} style={{ padding: '8px' }}/>
          <textarea placeholder="Diagnóstico" required value={recordData.diagnosis} onChange={e => setRecordData({...recordData, diagnosis: e.target.value})} style={{ padding: '8px', minHeight: '60px' }}/>
        </div>

        <div style={{ border: '1px solid #ccc', padding: '10px' }}>
          <h3>3. Prescripción Médica (Estructurada)</h3>
          {medications.map((med, index) => (
            <div key={index} style={{ display: 'flex', gap: '5px', marginBottom: '10px', alignItems: 'center' }}>
              <input placeholder="Medicamento (Ej: Ibuprofeno)" value={med.name} onChange={e => handleMedChange(index, 'name', e.target.value)} style={{ padding: '8px', flex: 1 }} />
              <input placeholder="Dosis (Ej: 400mg)" value={med.dose} onChange={e => handleMedChange(index, 'dose', e.target.value)} style={{ padding: '8px', width: '100px' }} />
              <input placeholder="Frecuencia (Ej: Cada 8h)" value={med.frequency} onChange={e => handleMedChange(index, 'frequency', e.target.value)} style={{ padding: '8px', width: '120px' }} />
              {medications.length > 1 && (
                <button type="button" onClick={() => removeMedication(index)} style={{ padding: '8px', backgroundColor: 'red', color: 'white', border: 'none', cursor: 'pointer' }}>X</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addMedication} style={{ padding: '8px', backgroundColor: '#007bff', color: 'white', border: 'none', cursor: 'pointer' }}>+ Agregar Medicamento</button>
        </div>

        <div style={{ border: '1px solid #ccc', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3>4. Próxima Cita (Opcional)</h3>
          <input type="datetime-local" value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} style={{ padding: '8px' }}/>
          <input placeholder="Recomendaciones" value={recommendations} onChange={e => setRecommendations(e.target.value)} style={{ padding: '8px' }}/>
        </div>
        <button type="submit" style={{ padding: '12px', backgroundColor: '#28a745', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Guardar Consulta</button>
      </form>
    </div>
  );
}