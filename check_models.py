import asyncio
from app.infrastructure.redis import redis_client

async def limpiar():
    # Cambiamos la llave por el UUID real que tiene el historial viejo
    await redis_client.delete("chat:a91dc560-d6eb-4d7e-8d65-97257571449b")
    print("¡Memoria de Elena limpiada con éxito!")

asyncio.run(limpiar())