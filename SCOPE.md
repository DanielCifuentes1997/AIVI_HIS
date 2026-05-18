# Alcance Declarado - Proyecto AiVi MVP

Este documento define explícitamente los requisitos técnicos implementados y excluidos para el MVP de AiVi, en estricto cumplimiento con el Technical Requirements Document (TRD).

## 1. Requisitos Implementados (In Scope)

### 1.1. Componentes de Arquitectura
- **Backend Orquestador:** Servidor asíncrono (FastAPI) para lógica de negocio y llamadas a funciones (Function Calling) hacia el LLM.
- **WebSocket Hub:** Infraestructura de conexiones persistentes bidireccionales para la sincronización multimodal estricta (audio y eventos JSON de estado).
- **Cliente Multimodal (Paciente):** Progressive Web App (PWA) con interfaz paritaria (Voz y Pantalla).
- **Portal Administrativo y Farmacia:** Single Page Applications (SPA) para enrolamiento KYC y tablero reactivo de recepción de pedidos.
- **Persistencia y Estado:** Implementación de PostgreSQL para datos clínicos estructurados y Redis para el contexto en tiempo real de las sesiones y la IA.

### 1.2. Seguridad y Edge AI (Transacción Crítica)
- **Módulo de Biometría Local (Edge AI):** Detección de vitalidad activa (apertura mandibular y sonrisa) procesada 100% localmente en el cliente mediante Google MediaPipe.
- **Firma Electrónica (Web Crypto API):** Generación inexportable de token JWS (JSON Web Signature) en el dispositivo para garantizar el no repudio y equivalencia funcional.

## 2. Requisitos Excluidos (Out of Scope) y Justificaciones

De acuerdo con las exclusiones explícitas definidas en el TRD y PRD, no se implementará lo siguiente:

- **Portal de Redacción Médica:** 
  - *Justificación:* El consumo de datos clínicos se realizará estrictamente mediante inyección de archivos JSON (Data Seeding) directamente a la base de datos PostgreSQL, evitando el desarrollo de una interfaz paralela para el médico, según el alcance del MVP.
- **Entrenamiento/Desarrollo de Modelos IA Propios:**
  - *Justificación:* Se consumirán los modelos como cajas negras vía API (Gemini para LLM, Deepgram para STT y ElevenLabs para TTS) garantizando latencias ultra bajas y cumplimiento de privacidad (Acuerdos BAA).
- **Implementación de Hardware Criptográfico (HSM):**
  - *Justificación:* El firmado ocurre exclusivamente en el dispositivo del usuario mediante software (Web Cryptography API) por diseño de arquitectura descentralizada.
- **Validación por Biometría de Voz:**
  - *Justificación:* La validación de identidad se limita estrictamente al reconocimiento facial y pruebas de vida activas, garantizando mayor precisión para la transacción de medicamentos.
- **Interoperabilidad Gubernamental:**
  - *Justificación:* El sistema funcionará de manera aislada para la clínica en esta fase uno.

## 3. Desviaciones Arquitectónicas Justificadas (Guía del Estudiante)

- **Entorno de Desarrollo Local con Docker Desktop:**
  - *Justificación (Desviación del TRD):* Debido a restricciones críticas de hardware (Virtualization support / WSL2 blockers) en el equipo de desarrollo, se aprueba la desviación de no utilizar Docker Desktop localmente. Para mantener la coherencia con la arquitectura asíncrona, se emplearán servicios de base de datos en la nube (BaaS: Supabase/Neon para PostgreSQL y Upstash para Redis). El cumplimiento de la arquitectura basada en contenedores se garantizará proveyendo el `Dockerfile` del backend y delegando la fase de *build* al pipeline de CI (GitHub Actions).