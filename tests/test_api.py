import pytest
from httpx import AsyncClient, ASGITransport
import math
from app.main import app
from app.presentation.api import calculate_euclidean_distance

# 1. PRUEBAS UNITARIAS (Lógica Matemática)

def test_euclidean_distance_identical_faces():
    """Prueba Unitaria: Dos mallas faciales idénticas deben dar distancia 0.0"""
    face1 = [{"x": 0.5, "y": 0.5, "z": 0.5}]
    face2 = [{"x": 0.5, "y": 0.5, "z": 0.5}]
    dist = calculate_euclidean_distance(face1, face2)
    assert dist == 0.0

def test_euclidean_distance_different_faces():
    """Prueba Unitaria: Rostros diferentes deben calcular la hipotenusa 3D correctamente"""
    face1 = [{"x": 0.0, "y": 0.0, "z": 0.0}]
    face2 = [{"x": 3.0, "y": 4.0, "z": 0.0}]
    dist = calculate_euclidean_distance(face1, face2)
    assert dist == 5.0

def test_euclidean_distance_invalid_data():
    """Prueba Unitaria: Comportamiento ante datos corruptos o incompletos"""
    face1 = [{"x": 0.1, "y": 0.1, "z": 0.1}]
    face2 = []
    dist = calculate_euclidean_distance(face1, face2)
    assert dist == float('inf')

# 2. PRUEBAS DE INTEGRACIÓN ASÍNCRONAS

@pytest.mark.asyncio
async def test_health_check():
    """Comportamiento: El orquestador general debe estar vivo"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

@pytest.mark.asyncio
async def test_biometric_login_without_landmarks():
    """Comportamiento (Seguridad): Rechazar payload biométrico vacío"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/auth/biometric", json={"biometric_landmarks": []})
        assert response.status_code == 400
        assert "No se detectaron puntos faciales" in response.json()["detail"]

@pytest.mark.asyncio
async def test_biometric_login_unauthorized_face():
    """Comportamiento (Seguridad): Rechazar identidad no registrada (Threshold)"""
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            fake_face = [{"x": 0.1, "y": 0.1, "z": 0.1}]
            response = await ac.post("/api/auth/biometric", json={"biometric_landmarks": fake_face})
            assert response.status_code == 401
            assert "Rostro no reconocido" in response.json()["detail"]
    except OSError:
        pytest.skip("Omitido en CI: No hay base de datos conectada en este entorno.")

@pytest.mark.asyncio
async def test_sign_prescription_not_found():
    """Comportamiento (Criptografía): Rechazar firmas JWS para recetas inexistentes"""
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            fake_order_id = "00000000-0000-0000-0000-000000000000"
            response = await ac.post(
                f"/api/prescriptions/{fake_order_id}/sign",
                json={
                    "jws_token": "token.falso.de.prueba",
                    "liveness_status": "passed"
                }
            )
            assert response.status_code == 404
            assert "Orden no encontrada" in response.json()["detail"]
    except OSError:
        pytest.skip("Omitido en CI: No hay base de datos conectada en este entorno.")
        
@pytest.mark.asyncio
async def test_create_patient_missing_data():
    """Comportamiento (Negocio): Pydantic debe rechazar peticiones con campos obligatorios faltantes"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/patients",
            json={
                "first_name": "Test",
                # Omitimos intencionalmente el document_id y el email
            }
        )
        # 422 Unprocessable Entity = Pydantic bloqueó la petición correctamente
        assert response.status_code == 422