/* eslint-disable */
import { useState, useEffect, useRef } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export default function AdminView() {
  const [formData, setFormData] = useState({
    first_name: '', last_name: '', email: '', phone: '', document_id: '', blood_type: '', address: '', biometric_landmarks: null as any
  });
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const loadModel = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });
      setFaceLandmarker(landmarker);
      setIsModelLoaded(true);
    };
    loadModel();
  }, []);

  const startCamera = async () => {
    if (!faceLandmarker) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        videoRef.current.addEventListener("loadeddata", predictWebcam);
        setIsCameraActive(true);
      }
    } catch (error) {
      console.error(error);
      alert("Error accediendo a la cámara.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const predictWebcam = async () => {
    if (!videoRef.current || !faceLandmarker) return;
    const startTimeMs = performance.now();
    const results = faceLandmarker.detectForVideo(videoRef.current, startTimeMs);

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      const faceMesh = results.faceLandmarks[0];
      setFormData(prev => ({ ...prev, biometric_landmarks: faceMesh }));
      stopCamera();
    } else {
      if (streamRef.current) {
        window.requestAnimationFrame(predictWebcam);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.biometric_landmarks) {
      alert("Debes escanear el rostro del paciente antes de guardar.");
      return;
    }
    try {
      const response = await fetch('http://localhost:8000/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const res = await response.json();
      
      if (response.ok) {
        alert(`Paciente creado en la BD. UUID: ${res.patient_id}.`);
        setFormData({ first_name: '', last_name: '', email: '', phone: '', document_id: '', blood_type: '', address: '', biometric_landmarks: null });
      } else {
        alert('Error al crear paciente.');
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto bg-aivi-panel p-6 sm:p-8 rounded-xl shadow-2xl border border-gray-800 mt-4">
      <h2 className="text-2xl font-bold text-aivi-gold mb-6 border-b border-gray-700 pb-4">
        Panel Administrativo (KYC + Biometría)
      </h2>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        
        {/* Contenedor Grid para los inputs de texto */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input 
            placeholder="Nombres" required value={formData.first_name} 
            onChange={e => setFormData({...formData, first_name: e.target.value})} 
            className="w-full bg-black border border-gray-700 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors"
          />
          <input 
            placeholder="Apellidos" required value={formData.last_name} 
            onChange={e => setFormData({...formData, last_name: e.target.value})} 
            className="w-full bg-black border border-gray-700 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors"
          />
          <input 
            type="email" placeholder="Correo" required value={formData.email} 
            onChange={e => setFormData({...formData, email: e.target.value})} 
            className="w-full bg-black border border-gray-700 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors"
          />
          <input 
            placeholder="Teléfono" value={formData.phone} 
            onChange={e => setFormData({...formData, phone: e.target.value})} 
            className="w-full bg-black border border-gray-700 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors"
          />
          <input 
            placeholder="Documento" required value={formData.document_id} 
            onChange={e => setFormData({...formData, document_id: e.target.value})} 
            className="w-full bg-black border border-gray-700 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors"
          />
          <input 
            placeholder="Tipo Sangre" value={formData.blood_type} 
            onChange={e => setFormData({...formData, blood_type: e.target.value})} 
            className="w-full bg-black border border-gray-700 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors"
          />
          {/* El campo de dirección ocupa las dos columnas */}
          <input 
            placeholder="Dirección" value={formData.address} 
            onChange={e => setFormData({...formData, address: e.target.value})} 
            className="w-full sm:col-span-2 bg-black border border-gray-700 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold focus:ring-1 focus:ring-aivi-gold transition-colors"
          />
        </div>
        
        {/* Zona de Escaneo Biométrico */}
        {!formData.biometric_landmarks ? (
          <div className="p-6 border-2 border-dashed border-gray-600 rounded-xl bg-black/40 text-center flex flex-col items-center gap-4">
            <p className="text-gray-300 font-medium">
              {isModelLoaded ? "Motor Biométrico Listo." : "⏳ Cargando Motor Biométrico..."}
            </p>
            
            <video 
              ref={videoRef} autoPlay playsInline 
              className={`w-full max-w-[300px] mx-auto rounded-lg shadow-lg border border-aivi-gold scale-x-[-1] ${isCameraActive ? 'block' : 'hidden'}`}
            ></video>
            
            {!isCameraActive && isModelLoaded && (
              <button 
                type="button" onClick={startCamera} 
                className="bg-gray-800 hover:bg-gray-700 text-aivi-gold border border-gray-600 px-6 py-3 rounded-lg font-bold transition-all shadow-md flex items-center justify-center gap-2"
              >
                📸 Escanear Rostro (Obligatorio)
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 bg-green-900/20 border border-green-800 text-green-400 rounded-xl text-center font-bold flex items-center justify-center gap-2">
            ✅ Huella Facial Biométrica Capturada
          </div>
        )}

        {/* Botón de Submit */}
        <button 
          type="submit" 
          disabled={!formData.biometric_landmarks} 
          className={`w-full py-4 rounded-lg font-bold text-lg transition-all duration-300 ${
            formData.biometric_landmarks 
              ? 'bg-aivi-gold text-black hover:bg-yellow-600 shadow-[0_0_15px_rgba(197,154,99,0.3)] cursor-pointer' 
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }`}
        >
          Guardar Paciente
        </button>
        
      </form>
    </div>
  );
}