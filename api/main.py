"""
FastAPI Backend Application for Urban Flood Nowcasting System
Focused on Jankipuram, Lucknow, Uttar Pradesh, India.
Includes:
- Automated live rainfall ingestion from Open-Meteo into SQLite database.
- Sub-second ML nowcasting and flood-penalized evacuation routing.
- Real-time municipal alert and de-watering pump dispatch.
"""

import os
import json
import time
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field

from agents.coordinator import FloodNowcastCoordinator
from agents.data_agent import HOTSPOTS, JANKIPURAM_BBOX

logger = logging.getLogger("API")

# Initialize FastAPI App
app = FastAPI(
    title="Urban Flood Nowcasting API - Jankipuram, Lucknow",
    description="Sub-second AI-powered Urban Flood Inundation & Emergency Route Navigation System for Smart Cities.",
    version="2.1.0",
)

# Enable CORS for frontend clients (including Vite dev server on localhost:5173)
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
DIST_DIR = WEB_DIR / "dist"

# Initialize Master Agent Coordinator
coordinator = FloodNowcastCoordinator(
    data_dir=str(DATA_DIR),
    models_dir=str(MODELS_DIR),
)

# Cached latest nowcast state
latest_state = {
    "last_nowcast": None,
    "last_run_timestamp": None,
    "auto_ingest_active": True,
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


class IoTRainfallIngestRequest(BaseModel):
    source: str = Field("iot_rain_gauge_node_1", description="Identifier of reporting weather station or sensor")
    rain_rate_mm_hr: float = Field(..., ge=0.0, description="Measured precipitation rate in mm/hr")
    rain_accumulated_1h_mm: Optional[float] = Field(0.0, description="1-hour accumulated rainfall")
    station_name: Optional[str] = Field("Jankipuram Local Rain Gauge", description="Station label")
    raw_payload: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional sensor telemetry")


# Background automated ingestion worker
async def weather_poller_daemon():
    """Background task running every 180 seconds to fetch live rain and feed to DB."""
    # Give server 5 seconds to bind before first auto-cycle
    await asyncio.sleep(5)
    while True:
        try:
            if latest_state["auto_ingest_active"]:
                logger.info("Auto-Ingest Worker: Polling live weather feed...")
                res = coordinator.run_live_auto_cycle()
                latest_state["last_nowcast"] = res
                latest_state["last_run_timestamp"] = time.time()
                logger.info(f"Auto-Ingest Worker: Cycle completed. Status: {res.get('system_status')}")
        except Exception as e:
            logger.error(f"Auto-Ingest Worker failed: {e}")
        await asyncio.sleep(180)


@app.on_event("startup")
async def startup_event():
    """Warm up models, execute initial auto live cycle, and start poller."""
    try:
        res = coordinator.run_live_auto_cycle()
        latest_state["last_nowcast"] = res
        latest_state["last_run_timestamp"] = time.time()
    except Exception as e:
        logger.warning(f"Initial live auto cycle failed ({e}). Running baseline warmup.")
        try:
            res = coordinator.run_nowcast_cycle(rain_intensity_mm_hr=45.0, duration_hrs=1.0)
            latest_state["last_nowcast"] = res
            latest_state["last_run_timestamp"] = time.time()
        except Exception as err:
            logger.error(f"Warmup nowcast failed: {err}")

    # Launch daemon task
    asyncio.create_task(weather_poller_daemon())


@app.get("/health")
def get_health() -> Dict[str, Any]:
    """Health check endpoint indicating model readiness and system status."""
    return {
        "status": "healthy",
        "region": "Jankipuram, Lucknow, UP",
        "models_loaded": coordinator.inference_agent.regressor is not None,
        "nodes_monitored": len(coordinator.inference_agent.node_cache) if coordinator.inference_agent.node_cache is not None else 0,
        "auto_ingest_active": latest_state["auto_ingest_active"],
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ==========================================
# Automated Live Rainfall & Database Endpoints
# ==========================================

@app.get("/api/rainfall/live")
def get_live_rainfall(lead_time_hours: int = Query(0, ge=0, le=4)) -> Dict[str, Any]:
    """
    Returns latest Doppler Weather Radar observation or advance nowcast from SQLite database,
    along with radar reflectivity (dBZ) and 4-hour forecast curve.
    """
    telemetry = coordinator.weather_service.fetch_doppler_radar_nowcast(lead_time_hours=lead_time_hours)
    latest_reading = coordinator.db.get_latest_rainfall()
    if not latest_reading:
        row_id = coordinator.db.insert_rainfall_reading(
            source=telemetry["source"],
            rain_rate_mm_hr=telemetry["rain_rate_mm_hr"],
            rain_accumulated_1h_mm=telemetry["rain_accumulated_1h_mm"],
            weather_code=telemetry["weather_code"],
            weather_desc=telemetry["weather_desc"],
            station_name=telemetry["station_name"],
            raw_payload=telemetry["raw_payload"],
        )
        latest_reading = coordinator.db.get_latest_rainfall()

    weather_info = {
        "temperature_c": telemetry.get("temperature_c", 30.0),
        "feels_like_c": telemetry.get("feels_like_c", 33.0),
        "humidity": telemetry.get("humidity", 78),
        "surface_pressure_hpa": telemetry.get("surface_pressure_hpa", 1006.0),
        "wind_speed_kmh": telemetry.get("wind_speed_kmh", 12.0),
        "weather_desc": telemetry.get("weather_desc", "Normal"),
        "weather_code": telemetry.get("weather_code", 0),
        "rain_rate_mm_hr": telemetry.get("rain_rate_mm_hr", 0.0),
        "rain_accumulated_1h_mm": telemetry.get("rain_accumulated_1h_mm", 0.0),
        "station_name": telemetry.get("station_name", "IMD Doppler Radar Lucknow (DWR)"),
        "source": telemetry.get("source", "IMD Doppler Weather Radar"),
        "radar_reflectivity_dbz": telemetry.get("radar_reflectivity_dbz", 10.0),
        "reflectivity_category": telemetry.get("reflectivity_category", "CLEAR_AIR"),
        "reflectivity_label": telemetry.get("reflectivity_label", "Clear Air"),
        "reflectivity_color": telemetry.get("reflectivity_color", "#10b981"),
        "storm_cell_velocity_kmh": telemetry.get("storm_cell_velocity_kmh", 15.0),
        "lead_time_hours": telemetry.get("lead_time_hours", lead_time_hours),
        "lead_time_label": telemetry.get("lead_time_label", "Live Scan (T+0)"),
        "timestamp": telemetry.get("timestamp"),
        "forecast_curve": telemetry.get("forecast_curve", []),
    }

    return {
        "latest_reading": latest_reading,
        "weather_info": weather_info,
        "forecast_curve": telemetry.get("forecast_curve", []),
        "last_nowcast_state": latest_state.get("last_nowcast"),
        "last_run_timestamp": latest_state.get("last_run_timestamp"),
        "auto_ingest_active": latest_state["auto_ingest_active"],
    }


@app.get("/api/weather/live")
def get_live_weather(lead_time_hours: int = Query(0, ge=0, le=4)) -> Dict[str, Any]:
    """
    Directly queries IMD Doppler Radar & numerical nowcasting for real-time
    or advance multi-hour forecast at Jankipuram, Lucknow.
    """
    try:
        telemetry = coordinator.weather_service.fetch_doppler_radar_nowcast(lead_time_hours=lead_time_hours)
        return {
            "status": "success",
            "weather": telemetry,
            "timestamp": time.time(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Live radar query failed: {str(e)}")


@app.post("/api/weather/fetch-live")
def fetch_live_weather_and_sync(lead_time_hours: int = Query(0, ge=0, le=4)) -> Dict[str, Any]:
    """
    Fetch Doppler Radar advance nowcast, save to database, and execute immediate ML flood nowcast.
    """
    try:
        res = coordinator.run_live_auto_cycle(lead_time_hours=lead_time_hours)
        latest_state["last_nowcast"] = res
        latest_state["last_run_timestamp"] = time.time()
        return {
            "status": "success",
            "message": f"Doppler Radar nowcast (+{lead_time_hours}h) ingested and simulation refreshed.",
            "weather": res.get("live_weather"),
            "data": res,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Radar fetch and sync failed: {str(e)}")


@app.get("/api/rainfall/history")
def get_rainfall_history(limit: int = Query(50, ge=5, le=200)) -> Dict[str, Any]:
    """Returns chronological rainfall time-series from database for charts."""
    readings = coordinator.db.get_recent_readings(limit=limit)
    return {"count": len(readings), "readings": readings}


@app.post("/api/rainfall/sync-now")
def sync_live_weather_now(lead_time_hours: int = Query(0, ge=0, le=4)) -> Dict[str, Any]:
    """
    Explicitly forces a Doppler radar fetch, feeds reading into SQLite,
    and runs a fresh ML nowcast cycle immediately for the selected horizon.
    """
    try:
        res = coordinator.run_live_auto_cycle(lead_time_hours=lead_time_hours)
        latest_state["last_nowcast"] = res
        latest_state["last_run_timestamp"] = time.time()
        return {
            "status": "success",
            "message": f"Doppler radar (+{lead_time_hours}h) telemetry ingested into database and nowcast refreshed.",
            "weather": res.get("live_weather"),
            "data": res,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Live sync failed: {str(e)}")


@app.post("/api/rainfall/ingest")
def ingest_iot_rainfall(req: IoTRainfallIngestRequest) -> Dict[str, Any]:
    """
    Ingest rainfall observations from automated IoT rain gauges or municipal telemetry.
    Saves record to database and immediately triggers ML nowcast.
    """
    try:
        row_id = coordinator.db.insert_rainfall_reading(
            source=req.source,
            rain_rate_mm_hr=req.rain_rate_mm_hr,
            rain_accumulated_1h_mm=req.rain_accumulated_1h_mm or 0.0,
            weather_code=65 if req.rain_rate_mm_hr > 20 else 61,
            weather_desc="IoT Sensor Gauge Ingest",
            station_name=req.station_name or "Jankipuram Local Rain Gauge",
            raw_payload=req.raw_payload,
        )

        nowcast_cycle = coordinator.run_nowcast_cycle(
            rain_intensity_mm_hr=req.rain_rate_mm_hr,
            duration_hrs=1.0,
            amc_level=2,
            is_auto_ingested=True,
        )
        latest_state["last_nowcast"] = nowcast_cycle
        latest_state["last_run_timestamp"] = time.time()

        return {
            "status": "success",
            "reading_id": row_id,
            "nowcast": nowcast_cycle,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"IoT Ingest failed: {str(e)}")


@app.get("/api/alerts/history")
def get_alerts_history(limit: int = Query(20, ge=1, le=100)) -> Dict[str, Any]:
    """Returns past municipal alert bulletins logged in SQLite."""
    alerts = coordinator.db.get_recent_alerts(limit=limit)
    return {"alerts": alerts}


@app.get("/api/stats")
def get_system_stats() -> Dict[str, Any]:
    """Returns system status, model details, and database statistics."""
    db_stats = coordinator.db.get_system_stats()
    return {
        "system": {
            "name": "Urban Flood Nowcasting System",
            "region": "Jankipuram, Lucknow, UP",
            "models_loaded": coordinator.inference_agent.regressor is not None,
            "auto_ingest_active": latest_state["auto_ingest_active"],
            "last_run_timestamp": latest_state.get("last_run_timestamp"),
        },
        "database": db_stats,
    }


# ==========================================
# Core Simulation & Nowcasting Endpoints
# ==========================================

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
            is_auto_ingested=False,
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
    high_risk_keys = set()
    if last_nc and "alerts" in last_nc:
        for a in last_nc.get("alerts", []):
            for n in a.get("affected_nodes", []):
                high_risk_keys.add(n)

    for key, info in HOTSPOTS.items():
        status = "CRITICAL_ALERT" if key in high_risk_keys else "MONITORED"
        res[key] = {
            **info,
            "current_status": status,
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
        if req.rain_intensity_mm_hr is not None:
            nc = coordinator.inference_agent.predict_nowcast(rain_intensity_mm_hr=req.rain_intensity_mm_hr)
        else:
            last_nc = latest_state.get("last_nowcast")
            if last_nc and "nowcast" in last_nc and isinstance(last_nc["nowcast"], dict):
                nc = last_nc["nowcast"]
            elif last_nc and "node_predictions" in last_nc:
                nc = last_nc
            else:
                current_reading = coordinator.db.get_latest_rainfall()
                rain_val = current_reading.get("rain_rate_mm_hr", 0.0) if current_reading else 0.0
                nc = coordinator.inference_agent.predict_nowcast(rain_intensity_mm_hr=rain_val)

        route_res = coordinator.alert_agent.compute_safe_route(
            origin_lat=req.origin_lat,
            origin_lon=req.origin_lon,
            dest_lat=req.dest_lat,
            dest_lon=req.dest_lon,
            current_nowcast=nc,
        )
        if route_res.get("status") == "SUCCESS" and route_res.get("route"):
            props = route_res["route"].get("properties", {})
            coords = route_res["route"].get("geometry", {}).get("coordinates", [])
            return {
                **route_res,
                "total_distance_km": props.get("total_distance_km", 0.0),
                "estimated_travel_time_min": props.get("estimated_travel_time_min", 0.0),
                "route_status": props.get("route_status", "SAFE_CLEAR"),
                "max_depth_on_path_m": props.get("max_route_flood_depth_m", 0.0),
                "route_geojson": route_res["route"],
                "route_coordinates": coords,
            }
        return route_res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Routing calculation failed: {str(e)}")


# ==========================================
# Web App & Static Mounting
# ==========================================

# Mount built assets if Vite build exists in web/dist
if DIST_DIR.exists():
    assets_dir = DIST_DIR / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

@app.get("/")
def serve_root():
    """Serve built React application from dist/index.html, or fallback to web/index.html."""
    dist_index = DIST_DIR / "index.html"
    if dist_index.exists():
        return FileResponse(dist_index)
    legacy_index = WEB_DIR / "legacy_index.html"
    if legacy_index.exists():
        return FileResponse(legacy_index)
    index_file = WEB_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Urban Flood Nowcasting API is active. Build frontend in web/ to view dashboard."}

# Static folder fallback
if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")

