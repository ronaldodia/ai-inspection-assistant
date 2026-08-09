from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.migrate import run_migrations
from app.routers import admin, auth, inspections, photos


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations(settings.database_url)
    yield


app = FastAPI(title="Inspect IA API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(inspections.router)
app.include_router(photos.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}
