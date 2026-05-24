import { create } from 'zustand';

interface Message {
  text: string;
  sender: 'ai-message' | 'user-message' | 'system-message';
}

interface AiViState {
  patientId: string | null;
  ws: WebSocket | null;
  isConnected: boolean;
  messages: Message[];
  setPatientId: (id: string) => void;
  connectWebSocket: (id: string) => void;
  disconnectWebSocket: () => void;
  sendMessage: (text: string) => void;
  sendAudioAction: (base64Audio: string) => void;
  appendMessage: (text: string, sender: Message['sender']) => void;
}

export const useAiViStore = create<AiViState>((set, get) => ({
  patientId: localStorage.getItem('patient_uuid'),
  ws: null,
  isConnected: false,
  messages: [],

  setPatientId: (id: string) => {
    localStorage.setItem('patient_uuid', id);
    set({ patientId: id });
  },

  appendMessage: (text, sender) => {
    set((state) => ({
      messages: [...state.messages, { text, sender }]
    }));
  },

  connectWebSocket: (id: string) => {
    const currentWs = get().ws;
    if (currentWs && currentWs.readyState === WebSocket.OPEN) return;

    const wsBaseUrl = import.meta.env.VITE_WS_URL || "ws://localhost:8000";
    const ws = new WebSocket(`${wsBaseUrl}/ws/${id}`);

    ws.onopen = () => {
      set({ isConnected: true, ws });
      get().appendMessage("Conexión establecida con AiVi.", "system-message");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "STATE_UPDATE" && data.payload && data.payload.data) {
        get().appendMessage(data.payload.data.text, "ai-message");
        
        if (data.payload.data.audio) {
          const audioUrl = `data:audio/mpeg;base64,${data.payload.data.audio}`;
          const audio = new Audio(audioUrl);
          audio.play().catch(e => console.error("Error reproduciendo audio:", e));
        }
      }
    };

    ws.onclose = () => {
      set({ isConnected: false, ws: null });
      get().appendMessage("Conexión finalizada.", "system-message");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      set({ isConnected: false });
    };
  },

  disconnectWebSocket: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
    }
    localStorage.removeItem('patient_uuid');
    set({ patientId: null, ws: null, isConnected: false, messages: [] });
  },

  sendMessage: (text: string) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      get().appendMessage(text, "user-message");
      ws.send(JSON.stringify({ type: "USER_ACTION", context: text }));
    }
  },

  sendAudioAction: (base64Audio: string) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      get().appendMessage("🎙️ Audio enviado...", "user-message");
      ws.send(JSON.stringify({ type: "AUDIO_ACTION", context: base64Audio }));
    }
  }
}));