from fastapi import APIRouter

router = APIRouter()


@router.get("/api/health")
def health_check():
    return {"status": "ok", "service": "sneepcut-backend", "version": "0.1.0"}
