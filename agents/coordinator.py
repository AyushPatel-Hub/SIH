"""
Flood Nowcast Coordinator (Multi-Agent Orchestrator)
Coordinates Data Ingestion, Simulation/ML Inference, Spatial Alert Dispatches,
and Persistent Database Feeds (SQLite).
"""

import time
import logging
from pathlib import Path
from typing import Dict, Any, Optional

from .data_agent import DataIngestionAgent, HOTSPOTS
from .sim_engine import SimulationEngine
from .inference_agent import FloodInferenceAgent
from .alert_agent import AlertAndRoutingAgent
from .db_service import FloodNowcastDB
from .live_weather_service import LiveWeatherService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [Coordinator] %(message)s"
)
logger = logging.getLogger("Coordinator")


class FloodNowcastCoordinator:
    """
    Master Multi-Agent Orchestrator managing end-to-end flood nowcasting cycles
    with automated live weather feeds and persistent database logging.
    """

    def __init__(self, data_dir: str = "data", models_dir: str = "models", db_path: Optional[str] = None):
        self.data_dir = data_dir
        self.models_dir = models_dir

        logger.info("Initializing multi-agent nowcast system...")
        self.data_agent = DataIngestionAgent(data_dir=data_dir, models_dir=models_dir)
        self.sim_engine = SimulationEngine(data_dir=data_dir)
        self.inference_agent = FloodInferenceAgent(models_dir=models_dir, data_dir=data_dir)
        self.alert_agent = AlertAndRoutingAgent(data_dir=data_dir, models_dir=models_dir)

        # Database and Live Weather Service
        resolved_db_path = db_path or str(Path(data_dir) / "flood_nowcast.db")
        self.db = FloodNowcastDB(db_path=resolved_db_path)
        self.weather_service = LiveWeatherService()

        logger.info("All agents and database services initialized successfully.")

    def run_nowcast_cycle(
        self,
        rain_intensity_mm_hr: float = 75.0,
        duration_hrs: float = 1.0,
        amc_level: int = 2,
        is_auto_ingested: bool = False,
    ) -> Dict[str, Any]:
        """
        Execute a full pipeline cycle:
        1. Ingest/Simulate radar grid
        2. Run ML inference across drainage network
        3. Formulate spatial hazard layers & municipal alerts
        4. Log execution and alerts directly to database
        """
        start_time = time.perf_counter()
        logger.info(f"Triggering Nowcast Cycle: Rain={rain_intensity_mm_hr} mm/hr, Duration={duration_hrs}h, AMC={amc_level}, Auto={is_auto_ingested}")

        # Step 1: Ingest/Simulate Doppler Radar Grid
        radar_data = self.data_agent.simulate_doppler_radar_grid(base_intensity_mm_hr=rain_intensity_mm_hr)

        # Step 2 & 3: Run Alert & Routing pipeline with ML Surrogate
        alert_pack = self.alert_agent.process_nowcast_and_generate_alerts(
            rain_intensity_mm_hr=rain_intensity_mm_hr,
            duration_hrs=duration_hrs,
            amc_level=amc_level,
        )

        total_elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
        system_status = alert_pack["nowcast"]["system_status"]
        metrics = alert_pack["nowcast"]["metrics"]
        road_status = alert_pack["road_network_summary"]
        alerts = alert_pack["alerts"]

        # Step 4: Persist run and alerts in database
        try:
            nowcast_id = self.db.insert_nowcast_run(
                rain_intensity_mm_hr=rain_intensity_mm_hr,
                duration_hrs=duration_hrs,
                amc_level=amc_level,
                system_status=system_status,
                max_flood_depth_m=metrics.get("max_predicted_flood_depth_m", 0.0),
                closed_road_segments=road_status.get("closed_segments", 0),
                total_latency_ms=total_elapsed_ms,
                high_risk_hotspots=alert_pack.get("high_risk_hotspots", []),
                is_auto_ingested=is_auto_ingested,
            )
            self.db.insert_alerts(nowcast_run_id=nowcast_id, alerts=alerts)
        except Exception as db_err:
            logger.error(f"Failed to commit nowcast to database: {db_err}")
            nowcast_id = None

        return {
            "execution_id": f"nowcast_{int(time.time())}",
            "nowcast_run_db_id": nowcast_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "total_latency_ms": total_elapsed_ms,
            "radar_telemetry": {
                "max_rain_rate_mm_hr": radar_data["max_detected_intensity_mm_hr"],
                "mean_rain_rate_mm_hr": radar_data["mean_intensity_mm_hr"],
                "grid_bounds": radar_data["bounds"],
            },
            "system_status": system_status,
            "metrics": metrics,
            "road_status": road_status,
            "alerts": alerts,
            "geojson_file": alert_pack["geojson_file"],
            "hotspots": HOTSPOTS,
            "is_auto_ingested": is_auto_ingested,
            "nowcast": alert_pack["nowcast"],
        }

    def run_live_auto_cycle(self, lead_time_hours: int = 0) -> Dict[str, Any]:
        """
        Automated Doppler Radar Ingestion & Advance Nowcasting Cycle:
        1. Query IMD Doppler Radar nowcasting for Jankipuram with selected lead time (0-4h).
        2. Feed reading directly into the database.
        3. Trigger nowcast simulation with advance/live rainfall rate.
        4. Log results and return aggregated status with advance warnings.
        """
        lead_time_clamped = max(0, min(4, int(lead_time_hours)))
        logger.info(f"Executing Doppler Radar ingestion cycle with lead time = +{lead_time_clamped}h...")
        weather = self.weather_service.fetch_doppler_radar_nowcast(lead_time_hours=lead_time_clamped)

        # Insert reading into database
        reading_id = self.db.insert_rainfall_reading(
            source=weather["source"],
            rain_rate_mm_hr=weather["rain_rate_mm_hr"],
            rain_accumulated_1h_mm=weather["rain_accumulated_1h_mm"],
            weather_code=weather["weather_code"],
            weather_desc=weather["weather_desc"],
            station_name=weather["station_name"],
            raw_payload=weather["raw_payload"],
        )

        rain_rate = weather["rain_rate_mm_hr"]
        nowcast_result = self.run_nowcast_cycle(
            rain_intensity_mm_hr=rain_rate,
            duration_hrs=1.0,
            amc_level=2,
            is_auto_ingested=True,
        )

        # If this is an advance lead-time prediction, customize alerts with proactive lead time banner
        alerts = list(nowcast_result.get("alerts", []))
        if lead_time_clamped > 0 and rain_rate > 0:
            dbz_val = weather.get("radar_reflectivity_dbz", 35.0)
            advance_bulletin = {
                "severity": "ORANGE_ADVISORY" if rain_rate < 25.0 else "RED_ALERT",
                "headline": f"PROACTIVE ADVANCE WARNING: +{lead_time_clamped}h DOPPLER RADAR NOWCAST",
                "description": (
                    f"IMD Doppler Weather Radar (DWR Lucknow) detects an approaching convective cloud cell "
                    f"with {dbz_val} dBZ reflectivity. Projected arrival in Jankipuram in {lead_time_clamped} hour(s) "
                    f"with {rain_rate} mm/hr rain intensity. Advance pump deployment recommended."
                ),
                "affected_zones": ["Jankipuram Extension Underpass", "Sector F Drain Basin", "Kursi Road Corridor"],
                "action_item": f"Municipal crews have ~{lead_time_clamped * 60} minutes proactive lead time to mobilize de-watering pumps and close flood-prone underpasses.",
            }
            alerts.insert(0, advance_bulletin)
            nowcast_result["alerts"] = alerts

        return {
            **nowcast_result,
            "live_weather": weather,
            "rainfall_reading_id": reading_id,
            "lead_time_hours": lead_time_clamped,
            "lead_time_label": weather["lead_time_label"],
            "radar_reflectivity_dbz": weather["radar_reflectivity_dbz"],
        }


if __name__ == "__main__":
    coordinator = FloodNowcastCoordinator()
    result = coordinator.run_live_auto_cycle(lead_time_hours=3)
    print(f"[OK] Doppler Radar Auto Cycle (+{result['lead_time_hours']}h) completed in {result['total_latency_ms']}ms | Rain: {result['live_weather']['rain_rate_mm_hr']} mm/hr | Status: {result['system_status']}")

