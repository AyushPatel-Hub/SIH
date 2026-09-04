"""
Alert & Routing Agent for Urban Flood Emergency Management
Specialized for Jankipuram, Lucknow, Uttar Pradesh.

Responsibilities:
1. Spatial mapping of manhole surcharges onto road segments.
2. Dynamic graph re-weighting with flood-penalty costs (impassability > 0.30m).
3. Dijkstra emergency vehicle and citizen safe evacuation routing.
4. Exporting real-time GeoJSON layers and alert notifications.
"""

import json
import logging
import math
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import networkx as nx
import numpy as np

from .data_agent import DataIngestionAgent, HOTSPOTS
from .inference_agent import FloodInferenceAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [AlertAgent] %(message)s"
)
logger = logging.getLogger("AlertAgent")


class AlertAndRoutingAgent:
    """
    Emergency Hazard Mitigation and Dynamic Safe Routing Agent.
    """

    def __init__(self, data_dir: str = "data", models_dir: str = "models"):
        self.data_dir = Path(data_dir)
        self.models_dir = Path(models_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.models_dir.mkdir(parents=True, exist_ok=True)

        self.data_agent = DataIngestionAgent(data_dir=str(self.data_dir), models_dir=str(self.models_dir))
        self.inference_agent = FloodInferenceAgent(models_dir=str(self.models_dir), data_dir=str(self.data_dir))
        self.base_graph: Optional[nx.DiGraph] = None
        self._load_network()

    def _load_network(self):
        """Load or create the base spatial graph."""
        self.base_graph = self.data_agent.ingest_road_network()

    def process_nowcast_and_generate_alerts(
        self,
        rain_intensity_mm_hr: float = 80.0,
        duration_hrs: float = 1.0,
        amc_level: int = 2,
    ) -> Dict[str, Any]:
        """
        Run end-to-end nowcast -> calculate flooded road segments ->
        export PostGIS/GeoJSON spatial layers -> issue alert dispatches.
        """
        # 1. Run ML inference
        nowcast_result = self.inference_agent.predict_nowcast(
            rain_intensity_mm_hr=rain_intensity_mm_hr,
            duration_hrs=duration_hrs,
            amc_level=amc_level,
        )

        node_lookup = {p["node_id"]: p for p in nowcast_result["node_predictions"]}

        # 2. Build Inundated Road Graph and GeoJSON Feature Collection
        geojson_features = []
        impassable_roads = []
        warning_roads = []
        safe_roads = []

        # Enriched Graph for Safe Routing
        routing_graph = self.base_graph.copy()

        for u, v, data in self.base_graph.edges(data=True):
            u_info = node_lookup.get(u, {"predicted_depth_m": 0.0, "lat": 26.92, "lon": 80.94, "ground_elevation_m": 122.0})
            v_info = node_lookup.get(v, {"predicted_depth_m": 0.0, "lat": 26.92, "lon": 80.94, "ground_elevation_m": 122.0})

            # Road flood depth is taken as max depth of connected nodes
            road_flood_depth_m = round(max(u_info["predicted_depth_m"], v_info["predicted_depth_m"]), 3)
            length_m = data.get("length_m", 100.0)

            # Assign Status & Dynamic Routing Weight
            # Cost Penalty = length * (1.0 + 50.0 * depth^2)
            # If depth >= 0.30m, road is IMPASSABLE (infinite penalty or disconnected)
            if road_flood_depth_m >= 0.30:
                road_status = "CLOSED_IMPASSABLE"
                weight = float("inf")
                impassable_roads.append({"from": u, "to": v, "depth_m": road_flood_depth_m})
                severity_color = "#FF0033"  # Bright Red
            elif road_flood_depth_m >= 0.12:
                road_status = "CAUTION_WATERLOGGED"
                weight = length_m * (1.0 + (road_flood_depth_m * 15.0))
                warning_roads.append({"from": u, "to": v, "depth_m": road_flood_depth_m})
                severity_color = "#FF9900"  # Amber Orange
            else:
                road_status = "CLEAR_SAFE"
                weight = length_m
                safe_roads.append({"from": u, "to": v, "depth_m": road_flood_depth_m})
                severity_color = "#00FF66"  # Emerald Green

            # Update routing graph edge weight
            if routing_graph.has_edge(u, v):
                routing_graph[u][v]["flood_depth_m"] = road_flood_depth_m
                routing_graph[u][v]["weight"] = weight
                routing_graph[u][v]["status"] = road_status

            # Create GeoJSON LineString
            geojson_features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [u_info["lon"], u_info["lat"]],
                        [v_info["lon"], v_info["lat"]],
                    ],
                },
                "properties": {
                    "id": f"{u}_{v}",
                    "from_node": u,
                    "to_node": v,
                    "length_m": length_m,
                    "flood_depth_m": road_flood_depth_m,
                    "status": road_status,
                    "color": severity_color,
                    "from_elevation": u_info.get("ground_elevation_m", 122.0),
                    "to_elevation": v_info.get("ground_elevation_m", 122.0),
                },
            })

        # Also add Node (Manhole Surcharge) Features
        for node_id, p in node_lookup.items():
            color = (
                "#FF0033" if p["severity_level"] == "HIGH_RISK_ALERT"
                else "#FF9900" if p["severity_level"] == "MODERATE_WARNING"
                else "#00FF66"
            )
            geojson_features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [p["lon"], p["lat"]],
                },
                "properties": {
                    "node_id": node_id,
                    "name": p["name"],
                    "elevation_m": p["elevation_m"],
                    "flood_depth_m": p["predicted_depth_m"],
                    "surcharge_m3": p["predicted_surcharge_m3"],
                    "severity_level": p["severity_level"],
                    "inundation_status": p["inundation_status"],
                    "is_hotspot": p["is_hotspot"],
                    "color": color,
                },
            })

        geojson_doc = {
            "type": "FeatureCollection",
            "name": "Jankipuram_Flood_Hazard_Nowcast",
            "metadata": {
                "rain_intensity_mm_hr": rain_intensity_mm_hr,
                "duration_hrs": duration_hrs,
                "system_status": nowcast_result["system_status"],
            },
            "features": geojson_features,
        }

        # Save to disk
        out_geojson_path = self.data_dir / "flood_hazard_nowcast.geojson"
        with open(out_geojson_path, "w", encoding="utf-8") as f:
            json.dump(geojson_doc, f, indent=2)

        # Generate Actionable Emergency Alert Bulletins
        alerts = self._generate_public_safety_bulletins(nowcast_result, impassable_roads)

        return {
            "nowcast": nowcast_result,
            "road_network_summary": {
                "total_segments": len(geojson_features),
                "safe_segments": len(safe_roads),
                "caution_segments": len(warning_roads),
                "closed_segments": len(impassable_roads),
            },
            "alerts": alerts,
            "geojson_file": str(out_geojson_path),
        }

    def compute_safe_route(
        self,
        origin_lat: float,
        origin_lon: float,
        dest_lat: float,
        dest_lon: float,
        current_nowcast: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Compute the optimal hazard-free driving/evacuation route between two coordinates
        in Jankipuram avoiding inundated segments.
        """
        if self.base_graph is None:
            self._load_network()

        # Find closest nodes to origin and destination
        origin_node = self._find_nearest_node(origin_lat, origin_lon)
        dest_node = self._find_nearest_node(dest_lat, dest_lon)

        # Build dynamic weighted graph with flood penalties
        routing_graph = nx.Graph(self.base_graph.to_undirected())
        
        # If current nowcast provided, apply weights
        if current_nowcast and "node_predictions" in current_nowcast:
            depths = {p["node_id"]: p["predicted_depth_m"] for p in current_nowcast["node_predictions"]}
            for u, v in routing_graph.edges():
                d_u = depths.get(u, 0.0)
                d_v = depths.get(v, 0.0)
                max_d = max(d_u, d_v)
                length = routing_graph[u][v].get("length_m", 100.0)
                
                if max_d >= 0.30:
                    # Impassable
                    routing_graph[u][v]["weight"] = 1e8
                elif max_d >= 0.12:
                    routing_graph[u][v]["weight"] = length * (1.0 + (max_d * 20.0))
                else:
                    routing_graph[u][v]["weight"] = length

        try:
            path_nodes = nx.shortest_path(routing_graph, source=origin_node, target=dest_node, weight="weight")
            
            # Construct coordinate route path & elevation profile
            path_coords = []
            path_elevations = []
            total_distance_m = 0.0
            max_route_flood_depth_m = 0.0

            for i, n in enumerate(path_nodes):
                n_data = self.base_graph.nodes[n]
                path_coords.append([n_data["lon"], n_data["lat"]])
                path_elevations.append(n_data.get("ground_elevation_m", 122.0))
                
                if i > 0:
                    prev_n = path_nodes[i - 1]
                    seg_len = self.base_graph[prev_n][n].get("length_m", 100.0) if self.base_graph.has_edge(prev_n, n) else 100.0
                    total_distance_m += seg_len
                    seg_depth = self.base_graph[prev_n][n].get("flood_depth_m", 0.0) if self.base_graph.has_edge(prev_n, n) else 0.0
                    max_route_flood_depth_m = max(max_route_flood_depth_m, seg_depth)

            route_status = (
                "SAFE_CLEAR" if max_route_flood_depth_m < 0.10
                else "PASSABLE_WITH_CAUTION" if max_route_flood_depth_m < 0.25
                else "FLOOD_RISK_DIVERTED"
            )

            route_geojson = {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": path_coords,
                },
                "properties": {
                    "total_distance_km": round(total_distance_m / 1000.0, 2),
                    "estimated_travel_time_min": round((total_distance_m / 1000.0) / 25.0 * 60.0, 1),
                    "route_status": route_status,
                    "max_route_flood_depth_m": max_route_flood_depth_m,
                    "num_waypoints": len(path_nodes),
                },
            }

            return {
                "status": "SUCCESS",
                "route": route_geojson,
                "path_nodes": path_nodes,
                "elevations": path_elevations,
            }

        except nx.NetworkXNoPath:
            return {
                "status": "FAILED",
                "message": "No passable dry route found. Critical waterlogging surrounding destination.",
                "route": None,
            }

    def _find_nearest_node(self, lat: float, lon: float) -> str:
        """Find the nearest graph node to a given coordinate."""
        best_node = None
        min_dist = float("inf")
        for node_id, data in self.base_graph.nodes(data=True):
            dist = self.data_agent._haversine_distance(lat, lon, data["lat"], data["lon"])
            if dist < min_dist:
                min_dist = dist
                best_node = node_id
        return best_node or list(self.base_graph.nodes())[0]

    def _generate_public_safety_bulletins(
        self,
        nowcast: Dict[str, Any],
        impassable_roads: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Generate targeted municipal alerts and public safety warnings."""
        bulletins = []
        metrics = nowcast["metrics"]

        if metrics["high_risk_nodes"] > 0:
            bulletins.append({
                "severity": "RED_ALERT",
                "headline": "FLASH WATERLOGGING WARNING: CRITICAL ROAD CLOSURES IN JANKIPURAM",
                "description": f"Predicted intense precipitation has triggered severe surcharge across {metrics['high_risk_nodes']} critical junctions. Maximum predicted flood depth: {metrics['max_predicted_flood_depth_m']}m.",
                "affected_zones": ["Sector F Drain Basin", "Jankipuram Extension Underpass", "Engineering College Chauraha"],
                "action_item": "Divert city transit, deploy mobile de-watering pumps, and avoid underpass routes.",
            })

        if metrics["moderate_warning_nodes"] > 0:
            bulletins.append({
                "severity": "ORANGE_ADVISORY",
                "headline": "URBAN DRAINAGE SURCHARGE ADVISORY",
                "description": f"{metrics['moderate_warning_nodes']} road intersections are experiencing 10cm-25cm water accumulation. Traffic slow-down expected on Kursi Road arterial.",
                "affected_zones": ["Sector G Kursi Road", "AKTU Corridor"],
                "action_item": "Commuters advised to take bypass routes and reduce vehicle speed.",
            })

        if not bulletins:
            bulletins.append({
                "severity": "GREEN_NORMAL",
                "headline": "NORMAL URBAN DRAINAGE CONDITIONS",
                "description": "All monitored storm conduits and manholes are operating well below maximum hydraulic capacity.",
                "affected_zones": ["All Jankipuram Sectors"],
                "action_item": "Normal routine monitoring in effect.",
            })

        return bulletins


if __name__ == "__main__":
    agent = AlertAndRoutingAgent()
    alert_pack = agent.process_nowcast_and_generate_alerts(rain_intensity_mm_hr=95.0, duration_hrs=2.0)
    print(f"[OK] AlertAgent processed nowcast. Closed roads: {alert_pack['road_network_summary']['closed_segments']}")
    print(f"Sample Alert: {alert_pack['alerts'][0]['headline']}")
