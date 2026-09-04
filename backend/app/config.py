
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Core App
    app_name: str = "Sneepcut"
    app_url: str = "http://localhost"
    app_env: str = "development"

    # Database
    database_url: str = "postgresql://sneepcut:changeme@postgres:5432/sneepcut"
    direct_url: str | None = None

    # Redis & Celery
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str | None = None
    celery_backend_url: str | None = None

    # Auth & API
    nextauth_secret: str = ""
    internal_api_key: str = ""
    upload_token_secret: str = ""
    cors_origins: str = "http://localhost:3000,http://localhost"
    allowed_hosts: str = "*"
    gemini_api_key: str = ""

    # AWS S3 Settings
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_region: str = "us-east-1"
    aws_s3_bucket: str = "sneepcut-media"
    aws_s3_public_bucket: str = "sneepcut-public"
    aws_endpoint_url: str | None = None
    aws_public_base_url: str | None = None

    # Whisper Settings
    whisper_model_size: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    # Gemini Settings
    gemini_model_name: str = "gemini-2.5-flash"

    # Processing Settings
    max_clips: int = 15
    min_clip_duration: int = 15
    max_clip_duration: int = 60

    # Upload-Post API Settings
    upload_post_api_key: str | None = None
    upload_post_base_url: str = "https://api.uploadpost.example.com"

    # YouTube Settings
    youtube_cookies_path: str | None = None

    # Storage & Upload
    storage_type: str = "local"
    local_media_root: str = "/app/media"
    max_upload_size_mb: int = 2048
    upload_scanner_enabled: bool = False
    clamav_host: str = "clamav"
    clamav_port: int = 3310
    clamav_timeout_seconds: float = 120.0
    max_video_duration_minutes: int = 120
    default_free_credits: int = 100
    smart_crop_enabled: bool = True
    subtitles_enabled: bool = True

    def __init__(self, **data):
        super().__init__(**data)
        # Set Celery URLs from redis_url if not explicitly provided
        if not self.celery_broker_url:
            self.celery_broker_url = self.redis_url
        if not self.celery_backend_url:
            self.celery_backend_url = self.redis_url


settings = Settings()
