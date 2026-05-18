import asyncio
from app.infrastructure.redis import redis_client

async def limpiar():
    # Cambiamos la llave por el UUID real que tiene el historial viejo
    await redis_client.delete("chat:5452f5a0-fd32-4f95-8152-7f2e08b48880")
    print("¡Memoria de Elena limpiada con éxito!")

asyncio.run(limpiar())