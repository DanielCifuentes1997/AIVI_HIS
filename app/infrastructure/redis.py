import redis.asyncio as aioredis
from app.infrastructure.config import settings

redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)