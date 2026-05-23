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
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Panel Administrativo (KYC + Biometría)</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input placeholder="Nombres" required value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} style={{ padding: '8px' }}/>
        <input placeholder="Apellidos" required value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} style={{ padding: '8px' }}/>
        <input type="email" placeholder="Correo" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} style={{ padding: '8px' }}/>
        <input placeholder="Teléfono" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} style={{ padding: '8px' }}/>
        <input placeholder="Documento" required value={formData.document_id} onChange={e => setFormData({...formData, document_id: e.target.value})} style={{ padding: '8px' }}/>
        <input placeholder="Tipo Sangre" value={formData.blood_type} onChange={e => setFormData({...formData, blood_type: e.target.value})} style={{ padding: '8px' }}/>
        <input placeholder="Dirección" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} style={{ padding: '8px' }}/>
        
        {!formData.biometric_landmarks ? (
          <div style={{ padding: '10px', border: '1px dashed #ccc', textAlign: 'center' }}>
            <p>{isModelLoaded ? "Motor Biométrico Listo." : "Cargando Motor Biométrico..."}</p>
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxWidth: '300px', display: isCameraActive ? 'block' : 'none', margin: '0 auto', transform: 'scaleX(-1)' }}></video>
            {!isCameraActive && isModelLoaded && (
              <button type="button" onClick={startCamera} style={{ padding: '10px', backgroundColor: '#6c757d', color: 'white', border: 'none', cursor: 'pointer' }}>
                📸 Escanear Rostro (Obligatorio)
              </button>
            )}
          </div>
        ) : (
          <div style={{ padding: '10px', backgroundColor: '#d1e7dd', color: '#0f5132', textAlign: 'center', fontWeight: 'bold' }}>
            ✅ Huella Facial Biométrica Capturada
          </div>
        )}

        <button type="submit" disabled={!formData.biometric_landmarks} style={{ padding: '10px', backgroundColor: formData.biometric_landmarks ? '#007bff' : '#ccc', color: 'white', border: 'none', cursor: formData.biometric_landmarks ? 'pointer' : 'not-allowed' }}>
          Guardar Paciente
        </button>
      </form>
    </div>
  );
}