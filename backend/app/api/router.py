from fastapi import APIRouter

from app.api.brand import router as brand_router
from app.api.scripts import router as scripts_router
from app.api.clips import router as clips_router
from app.api.clips_edit import router as clips_edit_router
from app.api.health import router as health_router
from app.api.jobs import router as jobs_router
from app.api.media import router as media_router
from app.api.upload import router as upload_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(jobs_router)
api_router.include_router(clips_router)
api_router.include_router(clips_edit_router)
api_router.include_router(upload_router)
api_router.include_router(media_router)
api_router.include_router(brand_router)
api_router.include_router(scripts_router)
