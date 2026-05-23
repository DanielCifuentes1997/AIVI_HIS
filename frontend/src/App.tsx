import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import PacienteView from './views/PacienteView';
import MedicoView from './views/MedicoView';
import AdminView from './views/AdminView';
import FarmaciaView from './views/FarmaciaView';

export default function App() {
  return (
    <Router>
      <div style={{ backgroundColor: '#333', padding: '15px', color: 'white', display: 'flex', gap: '20px', fontFamily: 'sans-serif' }}>
        <strong>🏥 AiVi HIS</strong>
        <Link to="/paciente" style={{ color: '#61dafb', textDecoration: 'none' }}>Portal Paciente</Link>
        <Link to="/medico" style={{ color: '#61dafb', textDecoration: 'none' }}>Portal Médico</Link>
        <Link to="/admin" style={{ color: '#61dafb', textDecoration: 'none' }}>Admin KYC</Link>
        <Link to="/farmacia" style={{ color: '#61dafb', textDecoration: 'none' }}>Dashboard Farmacia</Link>
      </div>
      <Routes>
        <Route path="/paciente" element={<PacienteView />} />
        <Route path="/medico" element={<MedicoView />} />
        <Route path="/admin" element={<AdminView />} />
        <Route path="/farmacia" element={<FarmaciaView />} />
        <Route path="*" element={<Navigate to="/paciente" replace />} />
      </Routes>
    </Router>
  );
}