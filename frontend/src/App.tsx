import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import PacienteView from './views/PacienteView';
import MedicoView from './views/MedicoView';
import AdminView from './views/AdminView';
import FarmaciaView from './views/FarmaciaView';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-aivi-dark text-gray-200 font-sans flex flex-col">
        
        {/* Barra de Navegación */}
        <nav className="bg-black border-b border-aivi-gold/30 px-6 py-4 flex flex-col sm:flex-row items-center justify-between shadow-lg gap-4">
          <div className="flex items-center gap-3">
            {/* Logo de AiVi */}
            <img src="/logo_AiVi.png" alt="AiVi Logo" className="h-12 object-contain" />
            <div className="flex flex-col">
              <strong className="text-aivi-gold text-xl tracking-wide">AiVi HIS</strong>
              <span className="text-xs text-gray-400 tracking-widest">UNA VISIÓN A SUS SENTIDOS</span>
            </div>
          </div>
          
          <div className="flex gap-6 text-sm">
            <Link to="/paciente" className="text-gray-300 hover:text-aivi-gold transition-colors font-semibold">Portal Paciente</Link>
            <Link to="/medico" className="text-gray-300 hover:text-aivi-gold transition-colors font-semibold">Portal Médico</Link>
            <Link to="/admin" className="text-gray-300 hover:text-aivi-gold transition-colors font-semibold">Admin KYC</Link>
            <Link to="/farmacia" className="text-gray-300 hover:text-aivi-gold transition-colors font-semibold">Dashboard Farmacia</Link>
          </div>
        </nav>

        {/* Banner Aclaratorio para el MVP */}
        <div className="bg-aivi-gold/10 border-b border-aivi-gold/20 text-aivi-gold py-2 text-center text-xs font-medium tracking-wide">
          ⚠️ NOTA: Las 4 ventanas están a la vista simultáneamente de forma exclusiva para mostrar el MVP y evaluar el funcionamiento.
        </div>

        {/* Contenedor de Vistas */}
        <main className="flex-grow p-6 flex justify-center">
          <div className="w-full max-w-5xl">
            <Routes>
              <Route path="/paciente" element={<PacienteView />} />
              <Route path="/medico" element={<MedicoView />} />
              <Route path="/admin" element={<AdminView />} />
              <Route path="/farmacia" element={<FarmaciaView />} />
              <Route path="*" element={<Navigate to="/paciente" replace />} />
            </Routes>
          </div>
        </main>

        {/* Footer con tu firma */}
        <footer className="py-6 text-center text-gray-600 text-xs border-t border-gray-800">
          <p>Desarrollado por <span className="font-bold text-gray-400">DCore Labs</span></p>
        </footer>

      </div>
    </Router>
  );
}