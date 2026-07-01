from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Core App
    app_name: str = "ClipForge"
    app_url: str = "http://localhost"
    app_env: str = "development"

    # Database
    database_url: str = "postgresql://clipforge:changeme@postgres:5432/clipforge"
    direct_url: Optional[str] = None

    # Redis & Celery
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: Optional[str] = None
    celery_backend_url: Optional[str] = None

    # Auth & API
    nextauth_secret: str = ""
    internal_api_key: str = ""
    cors_origins: str = "http://localhost:3000,http://localhost"
    allowed_hosts: str = "*"
    gemini_api_key: str = ""

    # AWS S3 Settings
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_region: str = "us-east-1"
    aws_s3_bucket: str = "clipforge-videos"
    aws_s3_public_bucket: str = "clipforge-public"
    aws_endpoint_url: Optional[str] = None
    aws_public_base_url: Optional[str] = None

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
    upload_post_api_key: Optional[str] = None
    upload_post_base_url: str = "https://api.uploadpost.example.com"

    # YouTube Settings
    youtube_cookies_path: Optional[str] = None

    # Storage & Upload
    storage_type: str = "local"
    local_media_root: str = "/app/media"
    max_upload_size_mb: int = 2048
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

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
