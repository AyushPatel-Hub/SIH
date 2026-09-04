"""
Urban Flood Nowcasting Pipeline CLI Runner
Entry point for training, nowcast generation, and API server execution.
"""

import argparse
import sys
import logging
from pathlib import Path

from agents.coordinator import FloodNowcastCoordinator
from agents.sim_engine import SimulationEngine
from agents.inference_agent import FloodInferenceAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("PipelineRunner")


def main():
    parser = argparse.ArgumentParser(
        description="Urban Flood Nowcasting System for Jankipuram, Lucknow, UP"
    )
    parser.add_argument(
        "--train",
        action="store_true",
        help="Generate synthetic SWMM simulation data and train surrogate ML models."
    )
    parser.add_argument(
        "--nowcast",
        action="store_true",
        help="Run an automated nowcast cycle."
    )
    parser.add_argument(
        "--rain",
        type=float,
        default=85.0,
        help="Rainfall intensity in mm/hr for nowcast (default: 85.0)."
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=1.5,
        help="Storm duration in hours (default: 1.5)."
    )
    parser.add_argument(
        "--serve",
        action="store_true",
        help="Start the FastAPI backend server and interactive MapLibre Web Dashboard."
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to serve API on (default: 8000)."
    )
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Host address for API (default: 0.0.0.0)."
    )

    args = parser.parse_args()

    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(0)

    coordinator = FloodNowcastCoordinator()

    if args.train:
        logger.info("=== STEP 1: HYDRAULIC SIMULATION DATASET GENERATION ===")
        sim_engine = SimulationEngine()
        df = sim_engine.run_synthetic_swmm_dataset_generator(num_scenarios=1000)
        logger.info(f"Generated {len(df)} simulation records.")

        logger.info("=== STEP 2: ML SURROGATE MODEL TRAINING ===")
        inference_agent = FloodInferenceAgent()
        metrics = inference_agent.train_models()
        logger.info(f"Model Training Finished: {metrics}")

    if args.nowcast:
        logger.info(f"=== RUNNING NOWCAST CYCLE (Rain: {args.rain} mm/hr, Duration: {args.duration}h) ===")
        result = coordinator.run_nowcast_cycle(
            rain_intensity_mm_hr=args.rain,
            duration_hrs=args.duration
        )
        logger.info(f"Nowcast Cycle Complete! Total Latency: {result['total_latency_ms']} ms")
        logger.info(f"System Status: {result['system_status']}")
        logger.info(f"Metrics: {result['metrics']}")
        logger.info(f"Closed Road Segments: {result['road_status']['closed_segments']}")
        for alert in result['alerts']:
            logger.info(f"Alert [{alert['severity']}]: {alert['headline']}")

    if args.serve:
        import uvicorn
        logger.info(f"Starting FastAPI & MapLibre Dashboard on http://localhost:{args.port} ...")
        uvicorn.run("api.main:app", host=args.host, port=args.port, reload=True)


if __name__ == "__main__":
    main()
