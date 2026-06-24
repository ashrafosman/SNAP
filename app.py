"""SNAP QC Early Warning System — FastAPI entry point."""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import logging

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="SNAP QC Early Warning System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

import server.hr1_store  # noqa: F401 — eagerly load HR1 chunks at startup
from server.routes import cases, metrics, chat, health, documents, pipeline, settings, signals, profiles

app.include_router(health.router, prefix="/api")
app.include_router(cases.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(signals.router, prefix="/api")
app.include_router(profiles.router, prefix="/api")

# Serve React frontend
frontend_dir = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(frontend_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        return FileResponse(os.path.join(frontend_dir, "index.html"))
