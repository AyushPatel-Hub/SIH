"""
FastAPI Backend Application for Urban Flood Nowcasting System
Focused on Jankipuram, Lucknow, Uttar Pradesh, India.
"""

import os
import json
import time
from pathlib import Path
from typing import Dict, Any, Optional, List

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field

from agents.coordinator import FloodNowcastCoordinator
from agents.data_agent import HOTSPOTS, JANKIPURAM_BBOX

# Initialize FastAPI App
app = FastAPI(
    title="Urban Flood Nowcasting API - Jankipuram, Lucknow",
    description="Sub-second AI-powered Urban Flood Inundation & Emergency Route Navigation System for Smart Cities.",
    version="2.0.0",
)

# Enable CORS for frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Project paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"
WEB_DIR = BASE_DIR / "web"

# Initialize Master Agent Coordinator
coordinator = FloodNowcastCoordinator(
    data_dir=str(DATA_DIR),
    models_dir=str(MODELS_DIR),
)

# Cached latest nowcast state
latest_state = {
    "last_nowcast": None,
    "last_run_timestamp": None,
}


# Request/Response Schemas
class FloodPredictionRequest(BaseModel):
    rain_intensity_mm_hr: float = Field(
        75.0,
        ge=0.0,
        le=300.0,
        description="Rainfall intensity in mm/hr (simulated Doppler radar or gauge input)."
    )
    duration_hrs: float = Field(
        1.0,
        ge=0.1,
        le=24.0,
        description="Storm event duration in hours."
    )
    amc_level: int = Field(
        2,
        ge=1,
        le=3,
        description="Antecedent Moisture Condition (1=Dry, 2=Moderate, 3=Saturated soil)."
    )


class SafeRouteRequest(BaseModel):
    origin_lat: float = Field(26.9092, description="Latitude of start position")
    origin_lon: float = Field(80.9415, description="Longitude of start position")
    dest_lat: float = Field(26.9360, description="Latitude of destination")
    dest_lon: float = Field(80.9520, description="Longitude of destination")
    rain_intensity_mm_hr: Optional[float] = Field(None, description="Optional override rain intensity to route under")


@app.on_event("startup")
async def startup_event():
    """Warm up models and generate initial baseline nowcast."""
    try:
        res = coordinator.run_nowcast_cycle(rain_intensity_mm_hr=45.0, duration_hrs=1.0)
        latest_state["last_nowcast"] = res
        latest_state["last_run_timestamp"] = time.time()
    except Exception as e:
        print(f"[Warning] Warmup nowcast failed ({e}).")


@app.get("/health")
def get_health() -> Dict[str, Any]:
    """Health check endpoint indicating model readiness and system status."""
    return {
        "status": "healthy",
        "region": "Jankipuram, Lucknow, UP",
        "models_loaded": coordinator.inference_agent.regressor is not None,
        "nodes_monitored": len(coordinator.inference_agent.node_cache) if coordinator.inference_agent.node_cache is not None else 0,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


@app.post("/predict_flooding")
def predict_flooding(req: FloodPredictionRequest) -> Dict[str, Any]:
    """
    Sub-second ML Nowcasting endpoint.
    Computes manhole surcharge volumes, flood depths, hazard categories,
    and returns situational municipal alerts.
    """
    try:
        nowcast_cycle = coordinator.run_nowcast_cycle(
            rain_intensity_mm_hr=req.rain_intensity_mm_hr,
            duration_hrs=req.duration_hrs,
            amc_level=req.amc_level,
        )
        latest_state["last_nowcast"] = nowcast_cycle
        latest_state["last_run_timestamp"] = time.time()
        return nowcast_cycle
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


@app.get("/flood_map")
def get_flood_map() -> Dict[str, Any]:
    """
    Returns the latest PostGIS/GeoJSON FeatureCollection containing
    flood depth segments, surcharging nodes, and color codes for MapLibre GL.
    """
    geojson_path = DATA_DIR / "flood_hazard_nowcast.geojson"
    if not geojson_path.exists():
        coordinator.run_nowcast_cycle(rain_intensity_mm_hr=60.0)

    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read flood map geojson: {str(e)}")


@app.get("/drainage_network")
def get_drainage_network() -> Dict[str, Any]:
    """Returns the base topological drainage network (Manholes and Conduits) in GeoJSON."""
    geojson_path = DATA_DIR / "drainage_network.geojson"
    if not geojson_path.exists():
        coordinator.data_agent.ingest_road_network()

    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load drainage network: {str(e)}")


@app.get("/hotspots")
def get_hotspots() -> Dict[str, Any]:
    """Returns critical Jankipuram drainage hotspots with live or baseline telemetry."""
    res = {}
    last_nc = latest_state.get("last_nowcast")
    node_preds = {}
    if last_nc and "alerts" in last_nc:
        # Load from node predictions if available
        pass

    for key, info in HOTSPOTS.items():
        res[key] = {
            **info,
            "current_status": "MONITORED",
        }
    return {"hotspots": res, "bounds": JANKIPURAM_BBOX}


@app.get("/radar")
def get_live_radar() -> Dict[str, Any]:
    """Returns live Doppler weather radar reflectivity grid matrix."""
    radar_file = DATA_DIR / "live_radar_grid.json"
    if radar_file.exists():
        with open(radar_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return coordinator.data_agent.simulate_doppler_radar_grid(base_intensity_mm_hr=65.0)


@app.post("/safe_route")
def compute_safe_route(req: SafeRouteRequest) -> Dict[str, Any]:
    """
    Computes an optimal flood-avoiding emergency route between two GPS coordinates
    in Jankipuram using real-time inundation penalties.
    """
    try:
        # If specific rain intensity provided, run nowcast first
        if req.rain_intensity_mm_hr is not None:
            nc = coordinator.inference_agent.predict_nowcast(rain_intensity_mm_hr=req.rain_intensity_mm_hr)
        else:
            nc = latest_state.get("last_nowcast")
            if nc and "nowcast" in nc:
                nc = nc["nowcast"]

        route_res = coordinator.alert_agent.compute_safe_route(
            origin_lat=req.origin_lat,
            origin_lon=req.origin_lon,
            dest_lat=req.dest_lat,
            dest_lon=req.dest_lon,
            current_nowcast=nc,
        )
        return route_res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Routing calculation failed: {str(e)}")


@app.get("/")
def serve_index():
    """Serve main interactive MapLibre Web Dashboard."""
    index_file = WEB_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Urban Flood Nowcasting API is active. Web dashboard not found."}


# Serve static web assets if available
if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")
    app.mount("/web", StaticFiles(directory=str(WEB_DIR), html=True), name="web")
