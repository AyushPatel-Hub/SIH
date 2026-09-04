"""
Simulation Engine for Urban Flood Dynamics
Simulates 1D/2D coupled hydraulic-hydrologic pipe network dynamics (SWMM style)
across Jankipuram under varied storm hyetographs, intensities, and catchment conditions.
"""

import math
import random
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional

import pandas as pd
import numpy as np
import networkx as nx

from .data_agent import DataIngestionAgent, HOTSPOTS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [SimEngine] %(message)s"
)
logger = logging.getLogger("SimEngine")


class SimulationEngine:
    """
    Hydraulic and Hydrologic SWMM-approximate Simulation Engine.
    Simulates overland surface runoff, inlet interception, conduit conveyance,
    and manhole pressurized overflow surcharging.
    """

    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.data_agent = DataIngestionAgent(data_dir=str(self.data_dir))

    def run_synthetic_swmm_dataset_generator(
        self,
        num_scenarios: int = 1200,
        output_csv_path: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Generate a comprehensive, scientifically grounded dataset simulating
        monsoon storm events across all manhole nodes in Jankipuram.
        """
        logger.info(f"Generating synthetic SWMM hydraulic training dataset with {num_scenarios} storm scenarios...")

        # Ingest or load drainage network
        graph = self.data_agent.ingest_road_network()
        nodes = list(graph.nodes(data=True))

        records: List[Dict[str, Any]] = []

        # Varied storm parameter distributions
        for scenario_idx in range(num_scenarios):
            # Storm intensity: 15 mm/hr (light shower) to 160 mm/hr (cloudburst)
            # Biased towards intense monsoon events (Lucknow July-Sept average)
            rain_intensity_mm_hr = float(np.random.choice([
                np.random.uniform(15.0, 45.0),
                np.random.uniform(45.0, 95.0),
                np.random.uniform(95.0, 160.0),
            ], p=[0.25, 0.45, 0.30]))

            # Storm duration in hours (0.25h to 5.0h)
            duration_hrs = float(np.random.uniform(0.25, 4.0))

            # Antecedent Soil Moisture Condition (AMC I: dry, AMC II: avg, AMC III: saturated)
            amc_level = int(np.random.choice([1, 2, 3], p=[0.2, 0.5, 0.3]))
            amc_multiplier = {1: 0.85, 2: 1.0, 3: 1.25}[amc_level]

            # Convective storm cell peak center (random spatial hotspot)
            hotspot_keys = list(HOTSPOTS.keys())
            epicenter_key = random.choice(hotspot_keys)
            epicenter = HOTSPOTS[epicenter_key]

            for node_id, node_data in nodes:
                lat = node_data.get("lat", 26.92)
                lon = node_data.get("lon", 80.94)
                elev = node_data.get("ground_elevation_m", 122.0)
                catchment_area_m2 = node_data.get("catchment_area_m2", 2500.0)
                imperviousness = node_data.get("imperviousness", 0.75) * amc_multiplier
                imperviousness = min(0.98, max(0.40, imperviousness))
                
                manhole_depth = node_data.get("depth_m", 2.2)
                max_node_cap_m3 = node_data.get("max_capacity_m3", 15.0)
                bottleneck_factor = node_data.get("flow_bottleneck_factor", 1.0)

                # Distance from convective cell center
                dist_to_epicenter_km = self.data_agent._haversine_distance(
                    lat, lon, epicenter["lat"], epicenter["lon"]
                )
                local_rain_intensity = rain_intensity_mm_hr * math.exp(-dist_to_epicenter_km / 2.5)
                local_rain_intensity = max(10.0, min(180.0, local_rain_intensity))

                # Hydrologic Runoff Generation (Rational formula: Q = C * I * A)
                # Accumulated tributary catchment
                accum_area_m2 = node_data.get("accumulated_catchment_m2", catchment_area_m2 * 2.5)
                
                # Inflow rate Qin in m3/s: (C * I [mm/hr] * Area [m2]) / (3600 * 1000)
                q_in_m3_s = (imperviousness * local_rain_intensity * accum_area_m2) / 3600000.0

                # Hydraulic Outflow capacity from connected downstream conduit pipes
                out_edges = graph.out_edges(node_id, data=True)
                if out_edges:
                    total_pipe_discharge_capacity_m3_s = sum(e[2].get("max_discharge_m3_s", 0.05) for e in out_edges)
                    avg_slope = np.mean([e[2].get("slope", 0.002) for e in out_edges])
                    avg_diameter_m = np.mean([e[2].get("diameter_m", 0.6) for e in out_edges])
                else:
                    total_pipe_discharge_capacity_m3_s = 0.03
                    avg_slope = 0.001
                    avg_diameter_m = 0.45

                # Surcharging / Backwater dynamic throttling
                effective_pipe_capacity_m3_s = total_pipe_discharge_capacity_m3_s / bottleneck_factor

                # Hydrodynamic surcharge rate (m3/s)
                excess_rate_m3_s = max(0.0, q_in_m3_s - effective_pipe_capacity_m3_s)
                
                # Surcharge volume accumulation over active convective peak window
                active_peak_seconds = min(duration_hrs * 3600.0, 7200.0)
                surcharge_volume_m3 = excess_rate_m3_s * active_peak_seconds * 0.75

                # Convert surcharge to 2D ponding flood depth (m) over road footprint
                ponding_area_m2 = max(catchment_area_m2 * 0.25, 400.0)
                flood_depth_m = round(min(2.5, surcharge_volume_m3 / ponding_area_m2), 3)

                # Classify Flood Hazard Severity Level
                if flood_depth_m < 0.12:
                    severity = "SAFE"
                elif flood_depth_m < 0.30:
                    severity = "MODERATE_WARNING"
                else:
                    severity = "HIGH_RISK_ALERT"

                # Total volumes for reporting
                runoff_volume_m3 = (local_rain_intensity / 1000.0) * accum_area_m2 * imperviousness
                drained_volume_m3 = effective_pipe_capacity_m3_s * (duration_hrs * 3600.0)

                record = {
                    "scenario_id": scenario_idx,
                    "node_id": node_id,
                    "lat": round(lat, 5),
                    "lon": round(lon, 5),
                    "is_hotspot": int(node_data.get("is_hotspot", False)),
                    "ground_elevation_m": round(elev, 2),
                    "manhole_depth_m": round(manhole_depth, 2),
                    "catchment_area_m2": round(catchment_area_m2, 1),
                    "imperviousness": round(imperviousness, 2),
                    "conduit_avg_slope": round(float(avg_slope), 5),
                    "conduit_avg_diameter_m": round(float(avg_diameter_m), 2),
                    "pipe_discharge_capacity_m3_s": round(float(effective_pipe_capacity_m3_s), 4),
                    "amc_level": amc_level,
                    "storm_duration_hrs": round(duration_hrs, 2),
                    "rain_intensity_mm_hr": round(local_rain_intensity, 2),
                    "runoff_inflow_m3": round(runoff_volume_m3, 2),
                    "discharged_volume_m3": round(min(runoff_volume_m3, drained_volume_m3), 2),
                    "surcharge_volume_m3": round(surcharge_volume_m3, 2),
                    "flood_depth_m": flood_depth_m,
                    "severity_level": severity,
                }
                records.append(record)

        df = pd.DataFrame(records)
        target_path = Path(output_csv_path) if output_csv_path else self.data_dir / "synthetic_flood_sim.csv"
        df.to_csv(target_path, index=False)
        logger.info(f"Dataset generated successfully with {len(df)} simulation rows -> Saved to {target_path}")
        return df


if __name__ == "__main__":
    engine = SimulationEngine()
    df = engine.run_synthetic_swmm_dataset_generator(num_scenarios=200)
    print(f"[OK] SimulationEngine finished. Sample data:\n{df[['node_id', 'rain_intensity_mm_hr', 'surcharge_volume_m3', 'flood_depth_m', 'severity_level']].head(5)}")
