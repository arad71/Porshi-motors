import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import SessionLocal
from .routers import public, sales, service, stock, system
from .seed import init_db, seed

logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if settings.seed_on_start:
        with SessionLocal() as db:
            if seed(db):
                logging.getLogger("porshi").info("Seeded demo data")
    yield


app = FastAPI(title="Porshi Motors API", version="1.0.0", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None,
              description="Dealership management system for Porshi Motors, Kushtia")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (public.router, sales.router, service.router, stock.router, system.router):
    app.include_router(r)

os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/api/health")
def health():
    return {"ok": True}
