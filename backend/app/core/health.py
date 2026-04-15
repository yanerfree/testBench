from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/api/healthz")
async def healthz():
    return {"status": "ok"}
