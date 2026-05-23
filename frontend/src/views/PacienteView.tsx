import { useState, useEffect, useRef } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { useAiViStore } from '../store/useAiViStore';

export default function PacienteView() {
  const { 
    patientId, setPatientId, connectWebSocket, disconnectWebSocket, 
    isConnected, messages, sendMessage, sendAudioAction 
  } = useAiViStore();

  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [loginStatus, setLoginStatus] = useState("👆 Toque aquí para Iniciar Sesión");
  const [isLoginCameraActive, setIsLoginCameraActive] = useState(false);
  const loginVideoRef = useRef<HTMLVideoElement>(null);
  const loginStreamRef = useRef<MediaStream | null>(null);

  const [isAutoMode, setIsAutoMode] = useState(false);
  const [vadStatus, setVadStatus] = useState("Inactivo");
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadStreamRef = useRef<MediaStream | null>(null);
  const isSpeakingRef = useRef(false);
  const isAutoModeRef = useRef(false);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopRef = useRef<number | null>(null);

  // Cargar el motor biométrico AL INICIO (Para que esté listo para el Login)
  useEffect(() => {
    loadBiometricModel();
    return () => {
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      if (vadStreamRef.current) vadStreamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Conectar WebSockets solo después del login exitoso
  useEffect(() => {
    if (patientId && !isConnected) {
      connectWebSocket(patientId);
      fetchMyOrders();
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

  const startVoiceLogin = () => {
    const synth = window.speechSynthesis;
    synth.cancel(); // Limpiar cualquier voz trabada de antes

    const utterance = new SpeechSynthesisUtterance("Bienvenido a Ai-vi H I S. ¿Deseas iniciar sesión? Di Sí.");
    utterance.lang = 'es-ES';
    
    // Hack para evitar que el navegador borre la voz de la memoria (Garbage Collection bug)
    (window as any).bgUtterance = utterance; 

    utterance.onend = () => {
      setLoginStatus("🎤 Escuchando tu respuesta...");
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Tu navegador no soporta reconocimiento de voz nativo.");
        return;
      }
      
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-ES';
      recognition.interimResults = false;
      
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        console.log("Micrófono escuchó:", transcript); // Para que veas en consola (F12) qué escuchó exactamente
        
        if (transcript.includes("sí") || transcript.includes("si") || transcript.includes("yes")) {
          setLoginStatus("📸 Abriendo cámara...");
          
          const ackUtterance = new SpeechSynthesisUtterance("Perfecto. Por favor, mire a la cámara y abra la boca para verificar su identidad.");
          ackUtterance.lang = 'es-ES';
          (window as any).bgAck = ackUtterance;
          synth.speak(ackUtterance);
          
          // SOLUCIÓN 1: Abrir la cámara inmediatamente, no esperar a que termine de hablar
          startLoginCamera(); 
        } else {
          setLoginStatus(`Entendió "${transcript}". Toque para reintentar.`);
        }
      };

      // SOLUCIÓN 2: Si el micrófono se apaga por silencio, actualizar la pantalla
      recognition.onend = () => {
        setLoginStatus(prev => 
          prev === "🎤 Escuchando tu respuesta..." 
            ? "⏱️ Silencio detectado. Toque aquí para reintentar." 
            : prev
        );
      };

      recognition.onerror = (e: any) => {
        console.error("Error de mic:", e.error);
        setLoginStatus("👆 Error al escuchar. Toque para reintentar.");
      };
      
      recognition.start();
    };
    synth.speak(utterance);
  };

  const startLoginCamera = async () => {
    if (!faceLandmarker) {
      setLoginStatus("Cargando IA Visual... un momento.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (loginVideoRef.current) {
        loginVideoRef.current.srcObject = stream;
        loginStreamRef.current = stream;
        loginVideoRef.current.addEventListener("loadeddata", predictLoginWebcam);
        setIsLoginCameraActive(true);
        setLoginStatus("Mire la cámara y ABRA LA BOCA...");
      }
    } catch (e) {
      console.error(e);
      setLoginStatus("Error al acceder a la cámara.");
    }
  };

  const predictLoginWebcam = async () => {
    if (!loginVideoRef.current || !faceLandmarker) return;
    const startTimeMs = performance.now();
    const results = faceLandmarker.detectForVideo(loginVideoRef.current, startTimeMs);

    // Verificamos que existan datos de estructura (Landmarks) y expresiones (Blendshapes)
    if (results.faceBlendshapes && results.faceBlendshapes.length > 0 && results.faceLandmarks && results.faceLandmarks.length > 0) {
      const blendshapes = results.faceBlendshapes[0].categories;
      const jawOpen = blendshapes.find(b => b.categoryName === "jawOpen")?.score || 0;

      // PRUEBA DE VIDA (Evita la trampa de la foto)
      if (jawOpen > 0.15) {
        const faceMesh = results.faceLandmarks[0]; // La huella 3D
        
        // Detener cámara
        if (loginStreamRef.current) {
          loginStreamRef.current.getTracks().forEach(t => t.stop());
          loginStreamRef.current = null;
        }
        setIsLoginCameraActive(false);
        setLoginStatus("⏳ Verificando identidad en el servidor...");

        try {
          const response = await fetch('http://localhost:8000/api/auth/biometric', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ biometric_landmarks: faceMesh })
          });
          
if (response.ok) {
            const data = await response.json();
            const synth = window.speechSynthesis;
            const msg = new SpeechSynthesisUtterance(`Bienvenido de nuevo, ${data.first_name}`);
            msg.lang = 'es-ES';
          
            synth.speak(msg);
            
            setLoginStatus(`✅ ¡Match Exitoso! Hola ${data.first_name}`);
            
            msg.onend = () => {
                setPatientId(data.patient_id); // LOG IN EXITOSO
            };
            
            setTimeout(() => {
                setPatientId(data.patient_id); 
            }, 3500);

            return;
          } else {
            setLoginStatus("❌ Rostro no reconocido. Toque para intentar de nuevo.");
            const synth = window.speechSynthesis;
            const msg = new SpeechSynthesisUtterance("Lo siento, tu rostro no coincide con nuestros registros.");
            msg.lang = 'es-ES';
            synth.speak(msg);
            return;
          }
        } catch (err) {
          console.error(err);
          setLoginStatus("Error de conexión con el servidor.");
          return;
        }
      }
    }

    if (loginStreamRef.current) {
      window.requestAnimationFrame(predictLoginWebcam);
    }
  };

  // Comandos de voz (Apertura de cámara de farmacia oculta)
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.sender === 'ai-message') {
        const match = lastMsg.text.match(/\[TRIGGER_CAMERA_([a-zA-Z0-9-]+)\]/);
        if (match && !isCameraActive) {
          const orderId = match[1];
          startLivenessCheck(orderId);
        }
      }
    }
  }, [messages]);

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

  // --- Biometric Flow (Firma en Farmacia) ---
  const startLivenessCheck = async (orderId: string) => {
    if (!faceLandmarker) {
      alert("El motor biométrico aún se está cargando. Intenta en un momento.");
      return;
    }
    setActiveOrderId(orderId);
    
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

  const generateAndSendSignature = async (orderId: string) => {
    try {
      const keyPair = await window.crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
      );

      const header = { alg: "ES256", typ: "JWT" };
      const payload = {
        jti: crypto.randomUUID(),
        sub: patientId,
        order_id: orderId,
        liveness: "passed",
        iat: Math.floor(Date.now() / 1000)
      };

      const base64UrlEncode = (obj: any) => 
        btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
      const encodedHeader = base64UrlEncode(header);
      const encodedPayload = base64UrlEncode(payload);
      const dataToSign = `${encodedHeader}.${encodedPayload}`;

      const encoder = new TextEncoder();
      const signature = await window.crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        keyPair.privateKey,
        encoder.encode(dataToSign)
      );

      const signatureArray = Array.from(new Uint8Array(signature));
      const signatureBase64Url = btoa(String.fromCharCode.apply(null, signatureArray))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
      const jwsToken = `${dataToSign}.${signatureBase64Url}`;

      const response = await fetch(`http://localhost:8000/api/prescriptions/${orderId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jws_token: jwsToken, liveness_status: "passed" })
      });

      if (response.ok) {
        alert("✅ Firma electrónica aplicada. La farmacia ya tiene la autorización.");
        fetchMyOrders(); 
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

      if (jawOpen > 0.15) {
        stopCamera();
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
      alert("Error al acceder al micrófono.");
    }
  };

  const handleVadAudio = (stream: MediaStream) => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    
    source.connect(analyser);
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const checkAudioLevel = () => {
      if (!isAutoModeRef.current) return; 
      
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;

      if (average > 35) { 
        if (!isSpeakingRef.current) {
          isSpeakingRef.current = true;
          setVadStatus("🗣️ Te escucho...");
          
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }

          if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
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
            };
            mediaRecorder.start();
          }
        } else {
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
        }
      } else {
        if (isSpeakingRef.current) {
          if (!silenceTimeoutRef.current) {
            silenceTimeoutRef.current = setTimeout(() => {
              isSpeakingRef.current = false;
              setVadStatus("⏳ Procesando...");
              
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
              }
              
              setTimeout(() => {
                if (isAutoModeRef.current) setVadStatus("👂 Esperando en silencio...");
              }, 1000);
            }, 1500); 
          }
        }
      }
      loopRef.current = requestAnimationFrame(checkAudioLevel);
    };
    checkAudioLevel();
  };

  const toggleAutoMode = async () => {
    if (isAutoMode) {
      setIsAutoMode(false);
      isAutoModeRef.current = false;
      setVadStatus("Inactivo");
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (audioContextRef.current) audioContextRef.current.close();
      if (vadStreamRef.current) vadStreamRef.current.getTracks().forEach(t => t.stop());
      isSpeakingRef.current = false;
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        vadStreamRef.current = stream;
        setIsAutoMode(true);
        isAutoModeRef.current = true;
        setVadStatus("👂 Esperando en silencio...");
        handleVadAudio(stream);
      } catch (error) {
        console.error(error);
        alert("Error al acceder al micrófono.");
      }
    }
  };

  if (!patientId) {
    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif', textAlign: 'center', marginTop: '50px' }}>
        <h1>AiVi - Acceso Inclusivo</h1>
        <p>Sistema de reconocimiento facial para pacientes.</p>
        
        {/* Botón inicial (se oculta con CSS cuando la cámara se activa) */}
        <div 
          onClick={startVoiceLogin} 
          style={{ 
            padding: '40px', backgroundColor: '#0dcaf0', borderRadius: '15px', 
            cursor: 'pointer', fontSize: '20px', fontWeight: 'bold', margin: '30px auto', maxWidth: '400px',
            color: 'black', boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
            display: isLoginCameraActive ? 'none' : 'block'
          }}
        >
          {loginStatus}
        </div>

        {/* Zona de Cámara (Siempre existe en el código, se muestra con CSS) */}
        <div style={{ 
          border: '3px dashed #0dcaf0', padding: '15px', borderRadius: '8px', backgroundColor: '#f8f9fa',
          display: isLoginCameraActive ? 'inline-block' : 'none' 
        }}>
          <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc3545' }}>{loginStatus}</p>
          <video ref={loginVideoRef} autoPlay playsInline style={{ width: '100%', maxWidth: '350px', transform: 'scaleX(-1)', borderRadius: '8px' }}></video>
        </div>
      </div>
    );
  }

  // --- VISTA DESPUÉS DE INICIAR SESIÓN ---
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
              {msg.text.replace(/\[TRIGGER_CAMERA_[a-zA-Z0-9-]+\]/g, '')}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input 
          type="text" value={inputText} onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
          placeholder="Escribe o habla con AiVi..."
          style={{ flex: 1, padding: '12px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '200px' }}
        />
        <button onClick={handleSendText} disabled={!isConnected} style={{ padding: '12px 20px' }}>Enviar</button>
        
        <button 
          onClick={toggleRecording} 
          disabled={!isConnected || isAutoMode} 
          style={{ padding: '12px 20px', backgroundColor: isRecording ? '#dc3545' : '#6c757d', color: 'white', border: 'none', borderRadius: '4px', opacity: isAutoMode ? 0.5 : 1 }}
        >
          {isRecording ? "⏹️ Detener" : "🎙️ Hablar"}
        </button>

        <button 
          onClick={toggleAutoMode} 
          disabled={!isConnected || isRecording} 
          style={{ padding: '12px 20px', backgroundColor: isAutoMode ? '#198754' : '#0dcaf0', color: isAutoMode ? 'white' : 'black', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}
        >
          {isAutoMode ? "🎧 Manos Libres ON" : "🎧 Manos Libres OFF"}
        </button>
      </div>

      {isAutoMode && (
        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#e2e3e5', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold' }}>
          Estado IA: <span style={{ color: isSpeakingRef.current ? '#198754' : '#6c757d' }}>{vadStatus}</span>
        </div>
      )}

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