from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    GOOGLE_API_KEY: str

    @property
    def async_database_url(self) -> str:
        if self.DATABASE_URL.startswith("postgresql://"):
            return self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
        if self.DATABASE_URL.startswith("postgres://"):
            return self.DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
        return self.DATABASE_URL

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()