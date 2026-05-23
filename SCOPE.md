# Alcance Declarado - Proyecto AiVi MVP V1.0

Este documento define explícitamente los requisitos técnicos implementados y las desviaciones justificadas para el MVP de AiVi, en estricto cumplimiento con el Technical Requirements Document (TRD) y los criterios de evaluación.

## 1. Desviación Arquitectónica Principal (Infraestructura)
* **Despliegue en AWS vs. Kubernetes:** El sistema **sí** se despliega en la infraestructura de AWS para su funcionamiento en la nube. Sin embargo, se documenta la desviación de **no utilizar un clúster de Kubernetes (EKS/K8s) ni Docker Desktop local**.
* **Justificación:** Problemas críticos de compatibilidad de hardware (WSL2/Virtualización) en la máquina de desarrollo impidieron el uso de Docker. Para el despliegue en AWS, gestionar un clúster de Kubernetes completo genera una sobrecarga de costos (Control Plane) y de operaciones innecesaria para esta fase. Se optó por una arquitectura más magra y eficiente utilizando servicios PaaS/BaaS en la nube, garantizando la misma resiliencia sin la complejidad de K8s.

---

## 2. Cumplimiento de la Estrategia de Pruebas (Sección 13 del TRD)

A continuación se detalla el estado exacto de cada prueba planteada en el TRD y la justificación técnica de las desviaciones.

### 2.1. Tests Unitarios
* **Lógica de Negocio (Backend):** `[PARCIALMENTE IMPLEMENTADO]`. Se automatizaron las pruebas de las funciones criptográficas y de seguridad en FastAPI (Distancia Euclidiana, validación Pydantic).
  * *Justificación de la desviación (Function Calling LLM):* Las pruebas unitarias requieren resultados deterministas. Las salidas de un LLM (Gemini) son no-deterministas por naturaleza. Probar la interpretación del LLM en la suite de CI generaría "flaky tests" (pruebas inestables). Esto se evaluó mediante QA de integración manual.
* **Componentes Reactivos (Frontend):** `[DESVIACIÓN]`.
  * *Justificación:* Probar actualizaciones de estado visual basadas en `STATE_UPDATE` de WebSockets requiere emular un servidor WebSocket completo con `mock-socket`. Se priorizó la prueba end-to-end (E2E) manual para garantizar la sincronización real STT/TTS, evitando falsos positivos que generan los mocks de UI en React.
* **Módulo Criptográfico (Frontend):** `[DESVIACIÓN]`.
  * *Justificación:* El token JWS se genera usando la `Web Crypto API` nativa del navegador. Escribir pruebas unitarias en Jest/Vitest obligaría a hacer un *mock* (simulación) de la API nativa de criptografía del navegador, lo cual invalida el propósito de la prueba. Se probó la validación del token desde el lado del servidor.

### 2.2. Tests de Integración
* **Flujo Multimodal Completo (Handshake WebSocket):** `[DESVIACIÓN]`.
  * *Justificación:* Las herramientas de CI estándar (GitHub Actions) no soportan inyección nativa de flujos de audio (PCM Chunks) en navegadores *headless* (sin interfaz). La persistencia del orquestador asíncrono se validó mediante monitoreo directo en la consola.
* **Integración Edge AI (MediaPipe -> Firmas):** `[DESVIACIÓN]`.
  * *Justificación:* Los entornos automatizados de integración continua (CI) carecen de hardware de cámara (Webcam) y aceleración por hardware (GPU/WASM), lo que hace técnicamente inviable probar el pipeline de MediaPipe de forma automatizada en la nube.
* **Consumo de APIs Externas (Deepgram/ElevenLabs):** `[DESVIACIÓN]`.
  * *Justificación:* Ejecutar pruebas automatizadas que consuman APIs externas de pago o de capa gratuita en cada *Push/Commit* agota rápidamente el límite de los *Rate Limits* (Tokens y Concurrencia), bloqueando el sistema.

### 2.3. Tests de Performance
* **Pruebas de Carga (50 conexiones simultáneas):** `[DESVIACIÓN]`.
  * *Justificación:* 50 conexiones simultáneas con transmisión bidireccional de audio y texto agotan de manera inmediata los límites de la capa gratuita (Free Tier) de los servicios de IA (Gemini, Deepgram, ElevenLabs) y Redis, provocando bloqueos por *Throttling* (HTTP 429).
* **Pruebas de Latencia (SLA < 1.5s):** `[DESVIACIÓN]`.
  * *Justificación:* En el entorno actual, dependemos del enrutamiento de internet público hacia 3 APIs distintas en su capa gratuita. La latencia estricta de 1.5s solo puede probarse y garantizarse en un entorno AWS de producción con redes dedicadas (VPC Peering o PrivateLink).
* **Estrés de Biometría (Edge Computing):** `[DESVIACIÓN]`.
  * *Justificación:* Medir el bloqueo del hilo principal del navegador en "dispositivos con recursos limitados" requiere una granja de dispositivos físicos reales (Device Farm). Los emuladores de navegador en CI no simulan correctamente el estrangulamiento térmico (Thermal Throttling) de una CPU móvil.

### 2.4. Tests de Seguridad
* **Verificación de No Repudio (Firmas Falsas):** `[IMPLEMENTADO]`.
  * Se desarrollaron pruebas automatizadas (`test_sign_prescription_not_found`) que inyectan tokens JWS inválidos, confirmando que el backend los rechaza estrictamente, protegiendo el `rx_hash`.
* **Pruebas de Privacidad (Data Leakage):** `[IMPLEMENTADO (Por Diseño)]`.
  * Mediante arquitectura de Edge Computing y auditoría de la pestaña de red (Network Tab), se garantiza que solo viajan los puntos de la topología (JSON) y nunca el feed de video crudo.
* **Aislamiento de Sesión (Pentesting):** `[DESVIACIÓN]`.
  * *Justificación:* Las pruebas de penetración y aislamiento de WebSockets son actividades de pre-producción. Se requiere que la infraestructura en AWS esté en estado *Release Candidate* estable para usar herramientas como OWASP ZAP. Se difiere para la Fase 2.

  ### 2.5. Criterios de Aceptación Técnicos (Sección 15 del TRD)

1. **Latencia de Interacción Multimodal (< 1.5s):** `[DESVIACIÓN]`
   * *Justificación:* En el entorno actual, la latencia supera el límite de 1.5s debido a la dependencia de tres APIs externas distintas (Gemini, Deepgram, ElevenLabs) operando bajo la capa gratuita (*Free Tier*) sobre internet público. Este SLA estricto requiere una topología de red dedicada en AWS (VPC Peering) e instancias aprovisionadas sin estrangulamiento de red, lo cual es parte de la hoja de ruta de la Fase 2 (Producción).

2. **Integridad Criptográfica (JWS y rx_hash):** `[IMPLEMENTADO]`
   * El orquestador (FastAPI) rechaza activamente cualquier transacción que no incluya un token JWS válido. Las pruebas automatizadas garantizan que no se puede firmar ni procesar una receta sin verificar criptográficamente la clave pública vinculada a la identidad del paciente.

3. **Cobertura de Pruebas (> 80% en Orquestación y Seguridad):** `[PARCIALMENTE IMPLEMENTADO]`
   * *Justificación de desviación:* Se superó el umbral del 80% estrictamente en los flujos deterministas de Seguridad (Módulo Biométrico y Criptográfico). Sin embargo, no se alcanzó el 80% global probando errores de red (fallos de API) del LLM, ya que realizar *mocking* de APIs de terceros en la suite automatizada puede ocultar fallos reales y crear *flaky tests* (pruebas inestables). Las excepciones de red se manejan mediante bloques *Try/Catch* en código en lugar de pruebas CI.

4. **Seguridad de Datos Sensibles (ePHI):** `[IMPLEMENTADO]`
   * Cumplido por diseño arquitectónico. El uso de procesamiento Edge AI (MediaPipe en el cliente) garantiza que la extracción biométrica ocurra en RAM y solo viaje la topología en JSON por la red. Los logs de AWS y la base de datos PostgreSQL solo persisten estados de vitalidad verificados y contraseñas cifradas (Bcrypt), manteniendo cero exposición de imágenes/video crudo.

5. **Resiliencia del WebSocket (Reconexión < 2s y Redis):** `[DESVIACIÓN]`
   * *Justificación:* Actualmente, la pérdida de conexión exige reinicio de sesión. Implementar reconexión stateful en menos de 2 segundos mediante colas Pub/Sub en Redis (Upstash) generaba un cuello de botella (*Network Overhead*) inadmisible desde el entorno local. Esta responsabilidad de tolerancia a fallos de conexión será delegada al API Gateway / Load Balancer de AWS en pre-producción.

6. **Calidad de Salida del LLM (100% JSON Válido):** `[IMPLEMENTADO]`
   * Cumplido. La integración con Gemini utiliza el modo estricto de *Function Calling*, forzando el retorno mediante un esquema estricto de Pydantic. El sistema evita alucinaciones estructurales porque la capa de aplicación descarta cualquier respuesta que no encaje en el contrato JSON de la base de datos clínica.

7. **Vulnerabilidades Críticas (0 en contenedores AWS):** `[DESVIACIÓN]`
   * *Justificación:* Dado que se justificó arquitectónicamente la omisión del uso de clústeres de Kubernetes (EKS) y Docker Desktop local a favor de servicios BaaS/PaaS más ágiles para el MVP, el escaneo de imágenes en repositorios (como Amazon ECR) pierde aplicabilidad en esta etapa. El control de vulnerabilidades se mantiene a nivel de dependencias estáticas (Pip/NPM) y *linting* en el CI/CD.

## 🚫 3. Requisitos Excluidos Originalmente (Out of Scope)
Como se definió desde el inicio:
* Entrenamiento de modelos IA propios (Se utilizan como caja negra).
* Portal de redacción médica completo (Sustituido por *Data Seeding* de JSON en base de datos).
* Validación de identidad por biometría de voz (Solo facial 3D).