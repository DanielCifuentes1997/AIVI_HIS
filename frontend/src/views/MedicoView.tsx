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
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/medical-consultation`, {
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
    <div className="w-full max-w-3xl mx-auto bg-aivi-panel p-6 sm:p-8 rounded-xl shadow-2xl border border-gray-800 mt-4">
      <h2 className="text-2xl font-bold text-aivi-gold mb-6 border-b border-gray-700 pb-4">
        Interfaz Médica (Data Estructurada)
      </h2>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        
        {/* 1. Selección de Paciente */}
        <div className="bg-black/40 border border-gray-700 p-5 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <span className="bg-gray-800 text-aivi-gold px-2 py-0.5 rounded text-sm">1</span> 
            Selección de Paciente
          </h3>
          <input 
            placeholder="UUID del Paciente" required value={patientId} 
            onChange={e => setPatientId(e.target.value)} 
            className="w-full bg-black border border-gray-600 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors"
          />
        </div>
        
        {/* 2. Historia Clínica */}
        <div className="bg-black/40 border border-gray-700 p-5 rounded-lg flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-gray-300 flex items-center gap-2">
            <span className="bg-gray-800 text-aivi-gold px-2 py-0.5 rounded text-sm">2</span> 
            Historia Clínica (JSONB)
          </h3>
          <div className="flex flex-col sm:flex-row gap-4">
            <input 
              placeholder="Peso (kg)" value={recordData.weight} 
              onChange={e => setRecordData({...recordData, weight: e.target.value})} 
              className="flex-1 bg-black border border-gray-600 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors"
            />
            <input 
              placeholder="Talla (cm)" value={recordData.height} 
              onChange={e => setRecordData({...recordData, height: e.target.value})} 
              className="flex-1 bg-black border border-gray-600 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors"
            />
          </div>
          <input 
            placeholder="Motivo de consulta" required value={recordData.reason} 
            onChange={e => setRecordData({...recordData, reason: e.target.value})} 
            className="w-full bg-black border border-gray-600 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors"
          />
          <textarea 
            placeholder="Diagnóstico" required value={recordData.diagnosis} 
            onChange={e => setRecordData({...recordData, diagnosis: e.target.value})} 
            className="w-full bg-black border border-gray-600 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors min-h-[80px] resize-y"
          />
        </div>

        {/* 3. Prescripción Médica */}
        <div className="bg-black/40 border border-gray-700 p-5 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <span className="bg-gray-800 text-aivi-gold px-2 py-0.5 rounded text-sm">3</span> 
            Prescripción Médica (Estructurada)
          </h3>
          
          <div className="flex flex-col gap-3 mb-4">
            {medications.map((med, index) => (
              <div key={index} className="flex flex-col sm:flex-row gap-2 items-center bg-gray-900/50 p-2 rounded-lg border border-gray-800">
                <input 
                  placeholder="Medicamento (Ej: Ibuprofeno)" value={med.name} 
                  onChange={e => handleMedChange(index, 'name', e.target.value)} 
                  className="w-full sm:flex-1 bg-black border border-gray-600 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors" 
                />
                <input 
                  placeholder="Dosis (Ej: 400mg)" value={med.dose} 
                  onChange={e => handleMedChange(index, 'dose', e.target.value)} 
                  className="w-full sm:w-32 bg-black border border-gray-600 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors" 
                />
                <input 
                  placeholder="Frecuencia (Ej: Cada 8h)" value={med.frequency} 
                  onChange={e => handleMedChange(index, 'frequency', e.target.value)} 
                  className="w-full sm:w-40 bg-black border border-gray-600 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors" 
                />
                {medications.length > 1 && (
                  <button 
                    type="button" onClick={() => removeMedication(index)} 
                    className="w-full sm:w-auto px-4 py-3 bg-red-900/30 text-red-400 hover:bg-red-600 hover:text-white border border-red-900/50 rounded-lg transition-colors"
                  >
                    X
                  </button>
                )}
              </div>
            ))}
          </div>
          
          <button 
            type="button" onClick={addMedication} 
            className="px-4 py-2 bg-gray-800 text-aivi-gold border border-gray-600 hover:border-aivi-gold rounded-lg transition-colors text-sm font-medium"
          >
            + Agregar Medicamento
          </button>
        </div>

        {/* 4. Próxima Cita */}
        <div className="bg-black/40 border border-gray-700 p-5 rounded-lg flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-gray-300 flex items-center gap-2">
            <span className="bg-gray-800 text-aivi-gold px-2 py-0.5 rounded text-sm">4</span> 
            Próxima Cita (Opcional)
          </h3>
          <div className="flex flex-col sm:flex-row gap-4">
            <input 
              type="datetime-local" value={appointmentDate} 
              onChange={e => setAppointmentDate(e.target.value)} 
              className="w-full sm:w-auto bg-black border border-gray-600 rounded-lg p-3 text-gray-200 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors [color-scheme:dark]"
            />
            <input 
              placeholder="Recomendaciones" value={recommendations} 
              onChange={e => setRecommendations(e.target.value)} 
              className="flex-1 bg-black border border-gray-600 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors"
            />
          </div>
        </div>

        {/* Botón de Guardar (Se mantiene en verde para indicar acción médica exitosa, pero adaptado al modo oscuro) */}
        <button 
          type="submit" 
          className="w-full py-4 rounded-lg font-bold text-lg transition-all duration-300 bg-green-700 hover:bg-green-600 text-white shadow-lg mt-2"
        >
          Guardar Consulta
        </button>
        
      </form>
    </div>
  );
}