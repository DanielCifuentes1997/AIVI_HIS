from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Bases de datos
    DATABASE_URL: str
    REDIS_URL: str
    
    # Llaves de servicios de IA
    GOOGLE_API_KEY: str
    DEEPGRAM_API_KEY: str
    ELEVENLABS_API_KEY: str
    
    # Credenciales de seguridad
    DEFAULT_DOCTOR_PASSWORD: str
    DEFAULT_PATIENT_PASSWORD: str

    @property
    def async_database_url(self) -> str:
        if self.DATABASE_URL.startswith("postgresql://"):
            return self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
        if self.DATABASE_URL.startswith("postgres://"):
            return self.DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
        return self.DATABASE_URL

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()