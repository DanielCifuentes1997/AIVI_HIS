/* eslint-disable */
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
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
          const response = await fetch(`${apiUrl}/api/auth/biometric`, {
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
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/patients/${patientId}/prescriptions`);
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

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/prescriptions/${orderId}/sign`, {
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
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
        <h1 className="text-4xl font-bold text-aivi-gold mb-2 tracking-wide">AiVi - Acceso Inclusivo</h1>
        <p className="text-gray-400 mb-10 text-lg">Sistema de reconocimiento facial para pacientes.</p>
        
        {/* Botón inicial (se oculta con Tailwind cuando la cámara se activa) */}
        <div 
          onClick={startVoiceLogin} 
          className={`px-8 py-5 bg-aivi-gold text-black rounded-2xl cursor-pointer text-xl font-bold max-w-md w-full shadow-[0_0_20px_rgba(212,175,55,0.3)] hover:bg-yellow-500 hover:scale-105 transition-all duration-300 ${isLoginCameraActive ? 'hidden' : 'block'}`}
        >
          {loginStatus}
        </div>

        {/* Zona de Cámara (Siempre existe en el código, se muestra con Tailwind) */}
        <div className={`border-2 border-dashed border-aivi-gold/50 p-6 rounded-2xl bg-black/60 shadow-2xl flex-col items-center gap-4 ${isLoginCameraActive ? 'flex' : 'hidden'}`}>
          <p className="text-xl font-bold text-aivi-gold animate-pulse">{loginStatus}</p>
          <video 
            ref={loginVideoRef} 
            autoPlay 
            playsInline 
            className="w-full max-w-[350px] scale-x-[-1] rounded-xl border border-gray-800 shadow-lg object-cover"
          ></video>
        </div>
      </div>
    );
  }

  // --- VISTA DESPUÉS DE INICIAR SESIÓN ---
  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-6 p-4">
      
      {/* Header del Asistente */}
      <div className="flex justify-between items-center bg-black/40 p-5 rounded-2xl border border-gray-800 shadow-md">
        <h1 className="text-2xl font-bold text-gray-200">AiVi - Asistente</h1>
        <span className={`font-bold px-4 py-1.5 rounded-full text-sm border shadow-inner ${isConnected ? 'bg-green-900/20 text-green-400 border-green-800/50' : 'bg-red-900/20 text-red-400 border-red-800/50'}`}>
          {isConnected ? "🟢 Conectado" : "🔴 Desconectado"}
        </span>
      </div>
      
      {/* Chat Window */}
      <div className="h-[400px] overflow-y-auto border border-gray-800 rounded-2xl p-5 bg-black/50 shadow-inner flex flex-col gap-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex w-full ${msg.sender === 'user-message' ? 'justify-end' : 'justify-start'}`}>
            <div className={`inline-block px-5 py-3 max-w-[85%] ${
              msg.sender === 'user-message' 
                ? 'bg-aivi-gold/10 text-aivi-gold border border-aivi-gold/30 rounded-2xl rounded-br-sm' 
                : msg.sender === 'ai-message' 
                  ? 'bg-gray-800 text-gray-200 border border-gray-700 rounded-2xl rounded-bl-sm' 
                  : 'bg-transparent text-gray-500 border border-dashed border-gray-800 text-sm italic rounded-xl'
            }`}>
              <strong className="block mb-1 opacity-80 text-xs uppercase tracking-wider">
                {msg.sender === 'ai-message' ? 'AiVi' : msg.sender === 'user-message' ? 'Tú' : ''}
              </strong>
              <span className="leading-relaxed">
                {msg.text.replace(/\[TRIGGER_CAMERA_[a-zA-Z0-9-]+\]/g, '')}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap gap-3 bg-black/40 p-5 rounded-2xl border border-gray-800 shadow-md items-stretch">
        <input 
          type="text" 
          value={inputText} 
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
          placeholder="Escribe o habla con AiVi..."
          className="flex-1 p-3 rounded-xl bg-gray-900/80 border border-gray-700 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-aivi-gold/60 focus:ring-1 focus:ring-aivi-gold/30 min-w-[200px] transition-all"
        />
        <button 
          onClick={handleSendText} 
          disabled={!isConnected} 
          className="px-6 py-3 bg-gray-800 text-gray-300 font-semibold rounded-xl hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700"
        >
          Enviar
        </button>
        
        <button 
          onClick={toggleRecording} 
          disabled={!isConnected || isAutoMode} 
          className={`px-6 py-3 font-semibold rounded-xl transition-colors border flex items-center gap-2 ${
            isRecording 
              ? 'bg-red-900/40 text-red-400 border-red-800 hover:bg-red-900/60' 
              : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
          } disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          {isRecording ? "⏹️ Detener" : "🎙️ Hablar"}
        </button>

        <button 
          onClick={toggleAutoMode} 
          disabled={!isConnected || isRecording} 
          className={`px-6 py-3 font-semibold rounded-xl transition-all border flex items-center gap-2 ${
            isAutoMode 
              ? 'bg-green-900/30 text-green-400 border-green-800 shadow-[0_0_15px_rgba(25,135,84,0.2)]' 
              : 'bg-aivi-gold/10 text-aivi-gold border-aivi-gold/30 hover:bg-aivi-gold/20'
          } disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          {isAutoMode ? "🎧 Manos Libres ON" : "🎧 Manos Libres OFF"}
        </button>
      </div>

      {/* VAD Status Panel */}
      {isAutoMode && (
        <div className="bg-black/60 border border-gray-800 p-3 rounded-xl text-center text-sm font-medium tracking-wide">
          <span className="text-gray-400">Estado IA: </span>
          <span className={`${isSpeakingRef.current ? 'text-green-400 animate-pulse' : 'text-aivi-gold'}`}>
            {vadStatus}
          </span>
        </div>
      )}

      {/* Medicamentos y Autorización */}
      <div className="mt-4 bg-black/40 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-800 pb-4">
          <h3 className="text-xl font-bold text-gray-200">📦 Estado de mis Medicamentos</h3>
          <button 
            onClick={fetchMyOrders} 
            className="px-4 py-2 text-sm bg-gray-800 text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white transition-colors"
          >
            ↻ Actualizar Consultas
          </button>
        </div>
        
        {myOrders.length === 0 ? (
          <p className="text-gray-500 italic text-center py-4">No tienes medicamentos registrados actualmente.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {myOrders.map((order, idx) => (
              <li key={idx} className="p-5 border border-gray-800 rounded-xl bg-gray-900/50 shadow-inner">
                <strong className="text-aivi-gold mb-2 block">Lista de Medicamentos:</strong> 
                <ul className="mb-4 pl-6 list-disc text-gray-300 space-y-1 marker:text-gray-600">
                  {order.prescription_data?.medications?.map((m: any, i: number) => (
                    <li key={i}><span className="text-gray-100 font-medium">{m.name}</span> - {m.dose} <span className="text-gray-500 text-sm">({m.frequency})</span></li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 mt-2 pt-4 border-t border-gray-800">
                  <strong className="text-gray-400">Estado de Despacho:</strong> 
                  <span className={`font-bold px-3 py-1 rounded text-xs tracking-wider uppercase border ${
                    order.delivery_status === 'pending' 
                      ? 'bg-yellow-900/20 text-yellow-500 border-yellow-800/50' 
                      : 'bg-blue-900/20 text-blue-400 border-blue-800/50'
                  }`}>
                    {order.delivery_status}
                  </span>
                </div>
                
                {order.delivery_status === 'pending' && !isCameraActive && (
                  <div className="mt-5">
                    <button 
                      onClick={() => startLivenessCheck(order.id)} 
                      className="px-5 py-2.5 bg-aivi-gold/10 text-aivi-gold border border-aivi-gold/30 rounded-xl hover:bg-aivi-gold/20 hover:border-aivi-gold/50 transition-all font-bold text-sm flex items-center gap-2"
                    >
                      📸 Autorizar con Rostro
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Cámara de Autorización (Farmacia) */}
        <div className={`mt-4 border-2 border-dashed border-aivi-gold/40 p-6 flex-col items-center text-center bg-black/60 rounded-2xl shadow-xl ${isCameraActive ? 'flex' : 'hidden'}`}>
          <h4 className="text-lg font-bold text-aivi-gold mb-1">Autorizando Orden</h4>
          <p className="text-gray-400 text-sm mb-5">Mire a la cámara y abra la boca para confirmar su identidad de forma segura.</p>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="w-full max-w-[300px] mx-auto scale-x-[-1] rounded-xl border border-gray-700 shadow-lg object-cover mb-4"
          ></video>
          <button 
            onClick={stopCamera} 
            className="px-6 py-2.5 bg-red-900/30 text-red-400 border border-red-800/50 rounded-xl hover:bg-red-900/50 transition-colors font-medium"
          >
            Cancelar Escaneo
          </button>
        </div>
      </div>

      <button 
        onClick={disconnectWebSocket} 
        className="mt-6 px-6 py-4 bg-red-900/10 text-red-500 border border-red-900/30 rounded-2xl hover:bg-red-900/20 hover:border-red-900/50 transition-all font-bold text-lg w-full"
      >
        Cerrar Sesión Segura
      </button>
    </div>
  );
}