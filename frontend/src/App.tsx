import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useAiViStore } from './store/useAiViStore';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

function PacienteView() {
  const { 
    patientId, setPatientId, connectWebSocket, disconnectWebSocket, 
    isConnected, messages, sendMessage, sendAudioAction 
  } = useAiViStore();

  const [inputText, setInputText] = useState("");
  const [uuidInput, setUuidInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // --- Liveness Detection States ---
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [isLivenessPassed, setIsLivenessPassed] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (patientId && !isConnected) {
      connectWebSocket(patientId);
      fetchMyOrders();
      loadBiometricModel(); 
    }
  }, [patientId, isConnected, connectWebSocket]);

  const loadBiometricModel = async () => {
    try {
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
    } catch (error) {
      console.error("Error loading MediaPipe:", error);
    }
  };

  const fetchMyOrders = async () => {
    if (!patientId) return;
    try {
      const response = await fetch(`http://localhost:8000/api/patients/${patientId}/prescriptions`);
      if (response.ok) {
        const data = await response.json();
        setMyOrders(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  // --- Biometric Flow ---
  const startLivenessCheck = async (orderId: string) => {
    if (!faceLandmarker) {
      alert("El motor biométrico aún se está cargando. Intenta en un momento.");
      return;
    }
    setActiveOrderId(orderId);
    setIsLivenessPassed(false);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        videoRef.current.addEventListener("loadeddata", predictLiveness);
        setIsCameraActive(true);
      }
    } catch (error) {
      console.error(error);
      alert("Error accediendo a la cámara. Revisa los permisos del navegador.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Función criptográfica: Genera token JWS con Web Crypto API
  const generateAndSendSignature = async (orderId: string) => {
    try {
      // 1. Generar par de llaves asimétricas (Curva Elíptica P-256)
      const keyPair = await window.crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
      );

      // 2. Construir Header y Payload del JWS
      const header = { alg: "ES256", typ: "JWT" };
      const payload = {
        jti: crypto.randomUUID(),
        sub: patientId,
        order_id: orderId,
        liveness: "passed",
        iat: Math.floor(Date.now() / 1000)
      };

      // Codificador Base64URL
      const base64UrlEncode = (obj: any) => 
        btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
      const encodedHeader = base64UrlEncode(header);
      const encodedPayload = base64UrlEncode(payload);
      const dataToSign = `${encodedHeader}.${encodedPayload}`;

      // 3. Firmar los datos con la llave privada generada localmente
      const encoder = new TextEncoder();
      const signature = await window.crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        keyPair.privateKey,
        encoder.encode(dataToSign)
      );

      // 4. Convertir firma y empaquetar JWS
      const signatureArray = Array.from(new Uint8Array(signature));
      const signatureBase64Url = btoa(String.fromCharCode.apply(null, signatureArray))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
      const jwsToken = `${dataToSign}.${signatureBase64Url}`;

      // 5. Enviar el token al Backend
      console.log("Token JWS Generado (Edge):", jwsToken);
      const response = await fetch(`http://localhost:8000/api/prescriptions/${orderId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          jws_token: jwsToken, 
          liveness_status: "passed" 
        })
      });

      if (response.ok) {
        alert("✅ Firma electrónica aplicada. La farmacia ya tiene la autorización.");
        fetchMyOrders(); // Refrescar tablero del paciente
      } else {
        alert("Error al validar la firma en el servidor.");
      }

    } catch (error) {
      console.error("Error en criptografía local:", error);
      alert("Error al generar la firma electrónica.");
    }
  };

  const predictLiveness = async () => {
    if (!videoRef.current || !faceLandmarker) return;
    const startTimeMs = performance.now();
    const results = faceLandmarker.detectForVideo(videoRef.current, startTimeMs);

    if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
      const blendshapes = results.faceBlendshapes[0].categories;
      const jawOpen = blendshapes.find(b => b.categoryName === "jawOpen")?.score || 0;

      // Si la apertura de mandíbula es mayor a 0.15
      if (jawOpen > 0.15) {
        setIsLivenessPassed(true);
        stopCamera();
        
        // ¡Magia! Llamamos a la criptografía pasándole el ID de la orden activa
        if (activeOrderId) {
          await generateAndSendSignature(activeOrderId);
        }
        return; 
      }
    }
    
    if (streamRef.current) {
      window.requestAnimationFrame(predictLiveness);
    }
  };

  const handleSendText = () => {
    if (inputText.trim()) {
      sendMessage(inputText.trim());
      setInputText("");
    }
  };

  const handleLogin = () => {
    if (uuidInput.trim()) {
      setPatientId(uuidInput.trim());
    }
  };

  const toggleRecording = async () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          if (reader.result) {
            const base64Audio = (reader.result as string).split(',')[1];
            sendAudioAction(base64Audio);
          }
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error(error);
      alert("Error al acceder al micrófono. Verifica los permisos.");
    }
  };

  if (!patientId) {
    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
        <h1>AiVi - Acceso de Paciente</h1>
        <p>Ingresa el UUID del paciente:</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text" value={uuidInput} onChange={(e) => setUuidInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Ej: 5452f5a0-fd32-4f95-8152-..."
            style={{ padding: '10px', width: '300px' }}
          />
          <button onClick={handleLogin} style={{ padding: '10px' }}>Ingresar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>AiVi - Asistente</h1>
        <span style={{ fontWeight: 'bold', color: isConnected ? 'green' : 'red' }}>
          {isConnected ? "🟢 Conectado" : "🔴 Desconectado"}
        </span>
      </div>
      
      <div style={{ 
        height: '300px', overflowY: 'auto', border: '1px solid #ccc', 
        borderRadius: '8px', padding: '15px', marginBottom: '15px', backgroundColor: '#f9f9f9'
      }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ 
            marginBottom: '12px', textAlign: msg.sender === 'user-message' ? 'right' : 'left',
            color: msg.sender === 'system-message' ? '#666' : '#000'
          }}>
            <div style={{
              display: 'inline-block', padding: '10px 15px', borderRadius: '15px',
              backgroundColor: msg.sender === 'user-message' ? '#d1e7dd' : msg.sender === 'ai-message' ? '#e2e3e5' : 'transparent',
              border: msg.sender === 'system-message' ? '1px dashed #ccc' : 'none'
            }}>
              <strong>{msg.sender === 'ai-message' ? 'AiVi: ' : msg.sender === 'user-message' ? 'Tú: ' : ''}</strong>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          type="text" value={inputText} onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
          placeholder="Escribe o habla con AiVi..."
          style={{ flex: 1, padding: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
        <button onClick={handleSendText} disabled={!isConnected} style={{ padding: '12px 20px' }}>Enviar</button>
        <button onClick={toggleRecording} disabled={!isConnected} style={{ padding: '12px 20px', backgroundColor: isRecording ? '#dc3545' : '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}>
          {isRecording ? "⏹️ Detener" : "🎙️ Hablar"}
        </button>
      </div>

      <div style={{ borderTop: '2px solid #ccc', paddingTop: '15px' }}>
        <h3>📦 Estado de mis Medicamentos</h3>
        <button onClick={fetchMyOrders} style={{ padding: '5px 10px', marginBottom: '10px' }}>Actualizar Consultas</button>
        
        {myOrders.length === 0 ? <p>No tienes medicamentos registrados.</p> : (
          <ul style={{ listStyleType: 'none', padding: 0 }}>
            {myOrders.map((order, idx) => (
              <li key={idx} style={{ padding: '10px', border: '1px solid #eee', marginBottom: '5px', borderRadius: '4px', backgroundColor: '#fff' }}>
                <strong>Medicamentos:</strong> 
                <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                  {order.prescription_data?.medications?.map((m: any, i: number) => (
                    <li key={i}>{m.name} - {m.dose} ({m.frequency})</li>
                  ))}
                </ul>
                <strong>Estado de Despacho:</strong> <span style={{ color: order.delivery_status === 'pending' ? 'orange' : 'blue', fontWeight: 'bold' }}>{order.delivery_status.toUpperCase()}</span>
                
                {order.delivery_status === 'pending' && !isCameraActive && (
                  <div style={{ marginTop: '10px' }}>
                    <button 
                      onClick={() => startLivenessCheck(order.id)} 
                      style={{ padding: '8px', backgroundColor: '#0dcaf0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      📸 Autorizar con Rostro
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* ZONA DE CÁMARA (FUERA DEL BUCLE) */}
        <div style={{ 
          display: isCameraActive ? 'block' : 'none', 
          marginTop: '20px', border: '2px dashed #0dcaf0', padding: '15px', 
          textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px' 
        }}>
          <h4>Autorizando Orden</h4>
          <p>Mire a la cámara y abra la boca para confirmar su identidad.</p>
          <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxWidth: '300px', margin: '0 auto', transform: 'scaleX(-1)' }}></video>
          <br/>
          <button onClick={stopCamera} style={{ marginTop: '10px', padding: '8px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Cancelar Escaneo
          </button>
        </div>
      </div>

      <button onClick={disconnectWebSocket} style={{ marginTop: '20px', padding: '10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', width: '100%' }}>
        Cerrar Sesión
      </button>
    </div>
  );
}

function MedicoView() {
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

function AdminView() {
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

    if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
      setFormData(prev => ({ ...prev, biometric_landmarks: results.faceBlendshapes[0].categories }));
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
      console.log("Respuesta del servidor:", res);
      
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

function FarmaciaView() {
  const [orders, setOrders] = useState<any[]>([]);

  const fetchOrders = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/farmacia/orders');
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, []);

  const updateStatus = async (orderId: string, status: 'alistando' | 'despacho') => {
    try {
      const response = await fetch(`http://localhost:8000/api/farmacia/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_status: status })
      });
      if (response.ok) fetchOrders();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Tablero de Control de Farmacia</h2>
      <p>Muestra las recetas que los pacientes ya autorizaron con su firma electrónica (Delivery status != pending).</p>
      <button onClick={fetchOrders} style={{ marginBottom: '15px', padding: '8px' }}>Refrescar Tablero</button>
      
      {orders.length === 0 ? <p>No hay órdenes autorizadas para despacho en este momento.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
          <thead>
            <tr style={{ backgroundColor: '#eee', textAlign: 'left' }}>
              <th style={{ padding: '10px', border: '1px solid #ccc' }}>ID Orden</th>
              <th style={{ padding: '10px', border: '1px solid #ccc' }}>Medicamentos</th>
              <th style={{ padding: '10px', border: '1px solid #ccc' }}>Estado Actual</th>
              <th style={{ padding: '10px', border: '1px solid #ccc' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td style={{ padding: '10px', border: '1px solid #ccc' }}>{order.id.slice(0,8)}...</td>
                <td style={{ padding: '10px', border: '1px solid #ccc' }}>
                  {order.prescription_data?.medications?.map((m:any) => m.name).join(', ')}
                </td>
                <td style={{ padding: '10px', border: '1px solid #ccc', fontWeight: 'bold' }}>{order.delivery_status.toUpperCase()}</td>
                <td style={{ padding: '10px', border: '1px solid #ccc', display: 'flex', gap: '5px' }}>
                  <button onClick={() => updateStatus(order.id, 'alistando')} style={{ backgroundColor: 'orange', border: 'none', padding: '5px', cursor: 'pointer' }}>Alistando</button>
                  <button onClick={() => updateStatus(order.id, 'despacho')} style={{ backgroundColor: 'green', color: 'white', border: 'none', padding: '5px', cursor: 'pointer' }}>Despacho</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

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