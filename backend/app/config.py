from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "ClipForge"
    app_env: str = "development"
    database_url: str = "postgresql://clipforge:changeme@postgres:5432/clipforge"
    redis_url: str = "redis://redis:6379/0"
    nextauth_secret: str = ""
    gemini_api_key: str = ""
    storage_type: str = "local"
    max_upload_size_mb: int = 2048
    max_video_duration_minutes: int = 120
    default_free_credits: int = 100

    class Config:
        env_file = ".env"


settings = Settings()
