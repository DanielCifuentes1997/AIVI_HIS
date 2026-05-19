const chatHistory = document.getElementById('chat-history');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const logoutBtn = document.getElementById('logout-btn');
const statusIndicator = document.getElementById('connection-status');
const micBtn = document.getElementById('mic-btn');

let ws;
let patientId = localStorage.getItem('patient_uuid');
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

function requestPatientId() {
    if (!patientId) {
        patientId = prompt("Ingresa el UUID del paciente registrado en la base de datos:");
        if (patientId) {
            localStorage.setItem('patient_uuid', patientId);
            connectWebSocket();
        } else {
            appendMessage("Acceso denegado. Se requiere un UUID válido.", "system-message");
        }
    } else {
        connectWebSocket();
    }
}

function connectWebSocket() {
    ws = new WebSocket(`ws://localhost:8000/ws/${patientId}`);

    ws.onopen = () => {
        statusIndicator.classList.add('connected');
        appendMessage("Conexión establecida con AiVi.", 'system-message');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "STATE_UPDATE" && data.payload && data.payload.data) {
            appendMessage(data.payload.data.text, 'ai-message');
            if (data.payload.data.audio) {
                playAudio(data.payload.data.audio);
            }
        }
    };

    ws.onclose = () => {
        statusIndicator.classList.remove('connected');
        appendMessage("Conexión finalizada.", 'system-message');
    };

    ws.onerror = (error) => {
        console.error(error);
        statusIndicator.classList.remove('connected');
    };
}

function playAudio(base64Audio) {
    const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
    const audio = new Audio(audioUrl);
    audio.play().catch(error => console.error(error));
}

function appendMessage(message, className) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', className);
    messageElement.textContent = message;
    chatHistory.appendChild(messageElement);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (message && ws && ws.readyState === WebSocket.OPEN) {
        appendMessage(message, 'user-message');
        ws.send(JSON.stringify({ type: "USER_ACTION", context: message }));
        messageInput.value = '';
    }
}

async function toggleRecording() {
    if (isRecording) {
        mediaRecorder.stop();
        micBtn.classList.remove('recording');
        isRecording = false;
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
                const base64Audio = reader.result.split(',')[1];
                if (ws && ws.readyState === WebSocket.OPEN) {
                    appendMessage("🎙️ Audio enviado...", 'user-message');
                    ws.send(JSON.stringify({ type: "AUDIO_ACTION", context: base64Audio }));
                }
            };
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        micBtn.classList.add('recording');
        isRecording = true;
    } catch (error) {
        console.error(error);
        appendMessage("Error al acceder al micrófono. Verifica los permisos.", 'system-message');
    }
}

function handleLogout() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    localStorage.removeItem('patient_uuid');
    chatHistory.innerHTML = '';
    patientId = null;
    
    setTimeout(() => {
        requestPatientId();
    }, 500);
}

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

micBtn.addEventListener('click', toggleRecording);
logoutBtn.addEventListener('click', handleLogout);

requestPatientId();