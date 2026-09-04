"""
Flood Nowcast Coordinator (Multi-Agent Orchestrator)
Coordinates Data Ingestion, Simulation/ML Inference, and Spatial Alert Dispatches.
"""

import time
import logging
from typing import Dict, Any, Optional

from .data_agent import DataIngestionAgent, HOTSPOTS
from .sim_engine import SimulationEngine
from .inference_agent import FloodInferenceAgent
from .alert_agent import AlertAndRoutingAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [Coordinator] %(message)s"
)
logger = logging.getLogger("Coordinator")


class FloodNowcastCoordinator:
    """
    Master Multi-Agent Orchestrator managing end-to-end flood nowcasting cycles.
    """

    def __init__(self, data_dir: str = "data", models_dir: str = "models"):
        self.data_dir = data_dir
        self.models_dir = models_dir

        logger.info("Initializing multi-agent nowcast system...")
        self.data_agent = DataIngestionAgent(data_dir=data_dir, models_dir=models_dir)
        self.sim_engine = SimulationEngine(data_dir=data_dir)
        self.inference_agent = FloodInferenceAgent(models_dir=models_dir, data_dir=data_dir)
        self.alert_agent = AlertAndRoutingAgent(data_dir=data_dir, models_dir=models_dir)
        logger.info("All agents initialized successfully.")

    def run_nowcast_cycle(
        self,
        rain_intensity_mm_hr: float = 75.0,
        duration_hrs: float = 1.0,
        amc_level: int = 2,
    ) -> Dict[str, Any]:
        """
        Execute a full pipeline cycle:
        1. Ingest/Simulate radar grid
        2. Run ML inference across drainage network
        3. Formulate spatial hazard layers & municipal alerts
        """
        start_time = time.perf_counter()
        logger.info(f"Triggering Nowcast Cycle: Rain={rain_intensity_mm_hr} mm/hr, Duration={duration_hrs}h, AMC={amc_level}")

        # Step 1: Ingest/Simulate Doppler Radar Grid
        radar_data = self.data_agent.simulate_doppler_radar_grid(base_intensity_mm_hr=rain_intensity_mm_hr)

        # Step 2 & 3: Run Alert & Routing pipeline with ML Surrogate
        alert_pack = self.alert_agent.process_nowcast_and_generate_alerts(
            rain_intensity_mm_hr=rain_intensity_mm_hr,
            duration_hrs=duration_hrs,
            amc_level=amc_level,
        )

        total_elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

        return {
            "execution_id": f"nowcast_{int(time.time())}",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "total_latency_ms": total_elapsed_ms,
            "radar_telemetry": {
                "max_rain_rate_mm_hr": radar_data["max_detected_intensity_mm_hr"],
                "mean_rain_rate_mm_hr": radar_data["mean_intensity_mm_hr"],
                "grid_bounds": radar_data["bounds"],
            },
            "system_status": alert_pack["nowcast"]["system_status"],
            "metrics": alert_pack["nowcast"]["metrics"],
            "road_status": alert_pack["road_network_summary"],
            "alerts": alert_pack["alerts"],
            "geojson_file": alert_pack["geojson_file"],
            "hotspots": HOTSPOTS,
        }


if __name__ == "__main__":
    coordinator = FloodNowcastCoordinator()
    result = coordinator.run_nowcast_cycle(rain_intensity_mm_hr=110.0, duration_hrs=2.0)
    print(f"[OK] Full Cycle completed in {result['total_latency_ms']}ms | Status: {result['system_status']}")
