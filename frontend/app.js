const chatHistory = document.getElementById('chat-history');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const logoutBtn = document.getElementById('logout-btn');
const statusIndicator = document.getElementById('connection-status');

let ws;
let patientId = localStorage.getItem('patient_uuid');

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

logoutBtn.addEventListener('click', handleLogout);

requestPatientId();