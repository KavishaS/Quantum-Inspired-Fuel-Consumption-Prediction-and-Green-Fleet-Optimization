"""
GREENFLEET QUANTUM - FastAPI application entrypoint.

Run:  uvicorn app.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api.routes import router
from .api.ais_routes import router as ais_router
from .api.map_routes import router as map_router
from .database.session import DATABASE_URL, init_db
from .services.ais_manager import AISManager

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s | %(message)s")
log = logging.getLogger("greenfleet")

CORS_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Initialising database at %s", DATABASE_URL)
    created = init_db(with_seed=os.getenv("SEED_ON_START", "1") == "1")
    if created:
        log.info("Seeded: %s", created)

    # Start AIS live tracking service
    ais_mgr = AISManager.instance()
    try:
        await ais_mgr.start()
        log.info("AIS manager state: %s", ais_mgr.state.value)
    except Exception:
        log.warning("AIS manager failed to start — live tracking unavailable",
                    exc_info=True)

    yield

    # Shutdown AIS
    try:
        await ais_mgr.stop()
    except Exception:
        log.debug("AIS manager stop error", exc_info=True)
    log.info("Shutting down")


app = FastAPI(
    title="GreenFleet Quantum API",
    description=(
        "Quantum-Inspired Fuel Consumption Prediction and Green Fleet Optimization "
        "(SIH PS-138).\n\n"
        "**Compute note:** all optimisation runs quantum-INSPIRED metaheuristics on "
        "classical hardware. No quantum computer is used.\n\n"
        "**Data note:** the bundled dataset is a demo dataset generated for simulation "
        "and algorithm validation, not real shipping-company data."),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(ais_router)
app.include_router(map_router)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    """Turn Pydantic errors into readable messages; never leak a stack trace."""
    problems = []
    for e in exc.errors():
        field = " -> ".join(str(p) for p in e["loc"] if p not in ("body", "query"))
        problems.append({"field": field or "request", "message": e["msg"]})
    return JSONResponse(status_code=422, content={
        "error": "Invalid input",
        "detail": "The request could not be processed because some values are invalid.",
        "problems": problems,
    })


@app.exception_handler(StarletteHTTPException)
async def http_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code,
                        content={"error": "Request failed", "detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={
        "error": "Internal error",
        "detail": ("Something went wrong while processing this request. "
                   "The details have been logged on the server."),
    })


@app.get("/", tags=["system"])
def root() -> dict:
    return {
        "name": "GREENFLEET QUANTUM",
        "tagline": "Predict. Optimize. Decarbonize.",
        "problem_statement": "PS-138 - Quantum-Inspired Fuel Consumption Prediction and Green Fleet Optimization",
        "docs": "/docs",
        "compute": "Quantum-inspired algorithms on classical hardware. No quantum computer is used.",
    }
