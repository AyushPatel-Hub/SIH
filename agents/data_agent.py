"""
Data Ingestion Agent for Urban Flood Nowcasting System
Specialized for Jankipuram, Lucknow, Uttar Pradesh, India.

Responsibilities:
1. Ingest road network using OSMnx or local 'map.osm' XML file.
2. Convert road graph to a directed storm-drainage/hydraulic graph (Nodes=Manholes, Edges=Pipes/Culverts).
3. Enrich nodes with Digital Elevation Model (DEM) baselines (~120m-126m AMSL) and topographic depression sinks.
4. Synthesize/Simulate high-resolution Doppler Radar precipitation grids (20–150 mm/hr).
"""

import os
import json
import logging
import math
import random
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, List

import networkx as nx
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [DataAgent] %(message)s"
)
logger = logging.getLogger("DataAgent")

# Jankipuram Spatial Constants (Lucknow, UP)
JANKIPURAM_BBOX = {
    "north": 26.9480,
    "south": 26.8920,
    "east": 80.9680,
    "west": 80.9150,
}

# Critical Local Hydrological Hotspots in Jankipuram
HOTSPOTS = {
    "engineering_college_chauraha": {
        "name": "Engineering College Chauraha (Aliganj-Jankipuram Junction)",
        "lat": 26.9092,
        "lon": 80.9415,
        "baseline_elevation_m": 121.2,
        "catchment_area_ha": 14.5,
        "critical_depth_threshold_m": 0.25,
        "flow_bottleneck_factor": 1.45,
    },
    "sector_f_drain": {
        "name": "Sector F Low-lying Drain Basin",
        "lat": 26.9210,
        "lon": 80.9380,
        "baseline_elevation_m": 120.4,
        "catchment_area_ha": 22.0,
        "critical_depth_threshold_m": 0.20,
        "flow_bottleneck_factor": 1.65,
    },
    "jankipuram_ext_underpass": {
        "name": "Jankipuram Extension Underpass Depression",
        "lat": 26.9360,
        "lon": 80.9520,
        "baseline_elevation_m": 119.8,
        "catchment_area_ha": 18.0,
        "critical_depth_threshold_m": 0.18,
        "flow_bottleneck_factor": 1.85,
    },
    "sector_g_kursi_road": {
        "name": "Sector G / Kursi Road Arterial Culvert",
        "lat": 26.9285,
        "lon": 80.9590,
        "baseline_elevation_m": 122.5,
        "catchment_area_ha": 12.0,
        "critical_depth_threshold_m": 0.30,
        "flow_bottleneck_factor": 1.20,
    },
    "aktu_sewa_hospital": {
        "name": "AKTU / Sewa Hospital Drainage Node",
        "lat": 26.9140,
        "lon": 80.9490,
        "baseline_elevation_m": 123.8,
        "catchment_area_ha": 9.5,
        "critical_depth_threshold_m": 0.35,
        "flow_bottleneck_factor": 1.10,
    },
}


class DataIngestionAgent:
    """Agent responsible for spatial graph extraction, DEM elevation enrichment, and radar grid ingestion."""

    def __init__(self, data_dir: str = "data", models_dir: str = "models"):
        self.data_dir = Path(data_dir)
        self.models_dir = Path(models_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.drainage_graph: Optional[nx.DiGraph] = None

    def find_local_osm_file(self) -> Optional[Path]:
        """Check for user-provided 'map.osm' in standard paths."""
        candidates = [
            self.data_dir / "map.osm",
            Path("map.osm"),
            Path("../map.osm"),
            self.data_dir / "jankipuram_map.osm",
        ]
        for path in candidates:
            if path.exists() and path.is_file() and path.stat().st_size > 0:
                logger.info(f"Found local OSM file at: {path.resolve()}")
                return path
        return None

    def ingest_road_network(self, place_query: str = "Jankipuram, Lucknow, Uttar Pradesh, India") -> nx.DiGraph:
        """
        Download or parse the road graph, prioritizing local map.osm if present,
        then attempting OSMnx online fetch, and falling back gracefully to high-fidelity synthetic topology.
        """
        osm_file = self.find_local_osm_file()
        if osm_file:
            try:
                import osmnx as ox
                logger.info(f"Loading road network from local OSM file: {osm_file}")
                # osmnx graph_from_xml parses raw .osm XML files
                raw_graph = ox.graph_from_xml(str(osm_file), simplify=True)
                return self._convert_to_drainage_network(raw_graph)
            except Exception as e:
                logger.warning(f"Failed to parse local OSM file ({e}). Trying OSMnx online or fallback.")

        try:
            import osmnx as ox
            logger.info(f"Attempting OSMnx download for query: '{place_query}'...")
            ox.settings.use_cache = True
            ox.settings.log_console = False
            raw_graph = ox.graph_from_place(place_query, network_type="drive", simplify=True)
            logger.info(f"Successfully downloaded road network: {len(raw_graph.nodes)} nodes, {len(raw_graph.edges)} edges.")
            return self._convert_to_drainage_network(raw_graph)
        except Exception as e:
            logger.warning(f"OSMnx online fetch unavailable or timed out ({e}). Generating high-fidelity Jankipuram hydraulic graph.")
            return self._generate_jankipuram_baseline_graph()

    def _convert_to_drainage_network(self, road_graph: nx.Graph) -> nx.DiGraph:
        """
        Convert OSMnx road graph to a directed hydraulic drainage network:
        - Intersections become Manholes/Junctions (with elevation and surface area).
        - Road segments become Conduit Pipes (with diameter, slope, roughness, discharge capacity).
        """
        drainage_g = nx.DiGraph()
        
        # Add and enrich nodes (Manholes)
        for node_id, data in road_graph.nodes(data=True):
            lat = data.get("y", 26.9200)
            lon = data.get("x", 80.9400)
            elevation = self._calculate_dem_elevation(lat, lon)
            manhole_depth_m = round(random.uniform(1.8, 3.5), 2)
            invert_elevation_m = round(elevation - manhole_depth_m, 2)
            
            # Check if close to known hotspot
            is_hotspot = False
            bottleneck = 1.0
            for hk, hinfo in HOTSPOTS.items():
                if self._haversine_distance(lat, lon, hinfo["lat"], hinfo["lon"]) < 0.4:
                    is_hotspot = True
                    bottleneck = hinfo["flow_bottleneck_factor"]
                    break

            drainage_g.add_node(
                str(node_id),
                node_id=str(node_id),
                lat=lat,
                lon=lon,
                ground_elevation_m=elevation,
                invert_elevation_m=invert_elevation_m,
                depth_m=manhole_depth_m,
                max_capacity_m3=round(manhole_depth_m * math.pi * (0.6 ** 2), 3),
                catchment_area_m2=round(random.uniform(2500, 8500), 1),
                imperviousness=round(random.uniform(0.75, 0.92), 2),
                is_hotspot=is_hotspot,
                flow_bottleneck_factor=bottleneck,
                node_type="major_drainage_hub" if is_hotspot else "manhole",
            )

        # Add directed edges (Pipes/Culverts directed along downward slope)
        for u, v, data in road_graph.edges(data=True):
            u_str, v_str = str(u), str(v)
            if u_str not in drainage_g or v_str not in drainage_g:
                continue

            u_elev = drainage_g.nodes[u_str]["ground_elevation_m"]
            v_elev = drainage_g.nodes[v_str]["ground_elevation_m"]
            length_m = data.get("length", 80.0)

            # Route water downhill; if flat, create directed bidirectional flow conduits
            source, target = (u_str, v_str) if u_elev >= v_elev else (v_str, u_str)
            slope = max(0.0008, abs(u_elev - v_elev) / max(length_m, 10.0))
            diameter_m = round(random.choice([0.45, 0.6, 0.75, 0.9]), 2)
            manning_n = 0.016  # Concrete sewer conduit Manning roughness

            # Manning formula pipe flow capacity: Q = (1/n) * A * (R^(2/3)) * (S^(1/2))
            area = math.pi * ((diameter_m / 2.0) ** 2)
            hyd_radius = diameter_m / 4.0
            max_discharge_m3_s = round((1.0 / manning_n) * area * (hyd_radius ** (2/3)) * math.sqrt(slope), 4)

            drainage_g.add_edge(
                source,
                target,
                length_m=round(length_m, 1),
                diameter_m=diameter_m,
                slope=round(slope, 4),
                manning_n=manning_n,
                max_discharge_m3_s=max_discharge_m3_s,
                culvert_type="circular_concrete",
            )

        # Compute cumulative upstream topological flow accumulation
        try:
            topo_order = list(nx.topological_sort(drainage_g))
            for n in topo_order:
                in_edges = drainage_g.in_edges(n, data=True)
                accum = drainage_g.nodes[n]["catchment_area_m2"]
                for u, _, _ in in_edges:
                    accum += drainage_g.nodes[u].get("accumulated_catchment_m2", 0.0) * 0.45
                drainage_g.nodes[n]["accumulated_catchment_m2"] = round(accum, 1)
        except Exception:
            # Fallback for graphs with cycles
            for n in drainage_g.nodes():
                drainage_g.nodes[n]["accumulated_catchment_m2"] = drainage_g.nodes[n]["catchment_area_m2"] * random.uniform(2.5, 6.0)

        self.drainage_graph = drainage_g
        self._save_network_cache()
        return drainage_g

    def _generate_jankipuram_baseline_graph(self) -> nx.DiGraph:
        """
        Procedurally generate realistic drainage topology for Jankipuram
        anchored directly around key landmarks and road corridors.
        """
        logger.info("Generating realistic procedural topological graph for Jankipuram...")
        drainage_g = nx.DiGraph()
        
        # 1. Add primary hotspot nodes
        for key, info in HOTSPOTS.items():
            elev = info["baseline_elevation_m"]
            drainage_g.add_node(
                key,
                node_id=key,
                name=info["name"],
                lat=info["lat"],
                lon=info["lon"],
                ground_elevation_m=elev,
                invert_elevation_m=elev - 2.5,
                depth_m=2.5,
                max_capacity_m3=35.0,
                catchment_area_m2=info["catchment_area_ha"] * 10000.0,
                imperviousness=0.85,
                is_hotspot=True,
                flow_bottleneck_factor=info["flow_bottleneck_factor"],
                node_type="major_drainage_hub",
            )

        # 2. Add grid intersections connecting Jankipuram sectors
        grid_rows, grid_cols = 7, 7
        lats = np.linspace(JANKIPURAM_BBOX["south"], JANKIPURAM_BBOX["north"], grid_rows)
        lons = np.linspace(JANKIPURAM_BBOX["west"], JANKIPURAM_BBOX["east"], grid_cols)

        for i, lat in enumerate(lats):
            for j, lon in enumerate(lons):
                node_id = f"jp_node_{i}_{j}"
                elev = self._calculate_dem_elevation(lat, lon)
                depth = round(random.uniform(1.8, 3.0), 2)
                
                drainage_g.add_node(
                    node_id,
                    node_id=node_id,
                    name=f"Jankipuram Sector Junction {i}-{j}",
                    lat=round(lat, 5),
                    lon=round(lon, 5),
                    ground_elevation_m=elev,
                    invert_elevation_m=round(elev - depth, 2),
                    depth_m=depth,
                    max_capacity_m3=round(depth * math.pi * (0.75 ** 2), 2),
                    catchment_area_m2=round(random.uniform(2500, 7500), 1),
                    imperviousness=round(random.uniform(0.70, 0.90), 2),
                    is_hotspot=False,
                    flow_bottleneck_factor=1.0,
                    node_type="manhole",
                )

        # 3. Create hydraulic pipe edges (directed downhill)
        nodes_list = list(drainage_g.nodes(data=True))
        for idx, (u, u_data) in enumerate(nodes_list):
            for v, v_data in nodes_list[idx + 1:]:
                dist_km = self._haversine_distance(u_data["lat"], u_data["lon"], v_data["lat"], v_data["lon"])
                if dist_km <= 0.85:  # Within drainage connection distance (~850m)
                    u_elev = u_data["ground_elevation_m"]
                    v_elev = v_data["ground_elevation_m"]
                    source, target = (u, v) if u_elev >= v_elev else (v, u)
                    length_m = round(dist_km * 1000.0, 1)
                    slope = max(0.0012, abs(u_elev - v_elev) / length_m)
                    diameter_m = 1.0 if u_data.get("is_hotspot") or v_data.get("is_hotspot") else 0.8
                    manning_n = 0.015
                    
                    area = math.pi * ((diameter_m / 2.0) ** 2)
                    hyd_radius = diameter_m / 4.0
                    q_max = round((1.0 / manning_n) * area * (hyd_radius ** (2/3)) * math.sqrt(slope), 3)

                    drainage_g.add_edge(
                        source,
                        target,
                        length_m=length_m,
                        diameter_m=diameter_m,
                        slope=round(slope, 4),
                        manning_n=manning_n,
                        max_discharge_m3_s=q_max,
                        culvert_type="reinforced_concrete_box" if diameter_m >= 1.0 else "circular_pipe",
                    )

        self.drainage_graph = drainage_g
        self._save_network_cache()
        logger.info(f"Constructed procedural drainage network: {len(drainage_g.nodes)} manholes, {len(drainage_g.edges)} conduits.")
        return drainage_g

    def _calculate_dem_elevation(self, lat: float, lon: float) -> float:
        """
        Calculate realistic continuous DEM elevation (m AMSL) across Jankipuram.
        Regional baseline slopes from North-East (~125.5m) down towards Gomti basin South-West (~120m),
        with marked localized micro-depressions at known waterlogging locations.
        """
        # Linear regional gradient
        norm_lat = (lat - JANKIPURAM_BBOX["south"]) / (JANKIPURAM_BBOX["north"] - JANKIPURAM_BBOX["south"] + 1e-6)
        norm_lon = (lon - JANKIPURAM_BBOX["west"]) / (JANKIPURAM_BBOX["east"] - JANKIPURAM_BBOX["west"] + 1e-6)
        
        base_elev = 120.5 + (norm_lat * 3.5) + (norm_lon * 1.5)

        # Micro-depression sinkhole penalties
        for _, hotspot in HOTSPOTS.items():
            dist_km = self._haversine_distance(lat, lon, hotspot["lat"], hotspot["lon"])
            if dist_km < 0.75:
                sink_depth = (1.0 - (dist_km / 0.75)) * 1.8
                base_elev -= sink_depth

        return round(float(base_elev), 2)

    def simulate_doppler_radar_grid(
        self,
        base_intensity_mm_hr: float = 65.0,
        cell_drift_dx: float = 0.005,
        cell_drift_dy: float = -0.003,
        num_convective_cells: int = 3,
    ) -> Dict[str, Any]:
        """
        Simulate real-time high-resolution Doppler weather radar reflectivity & rain rate grid.
        Returns a spatial 2D grid matrix of rain intensity (mm/hr) spanning Jankipuram.
        """
        grid_res = 10
        lats = np.linspace(JANKIPURAM_BBOX["south"], JANKIPURAM_BBOX["north"], grid_res)
        lons = np.linspace(JANKIPURAM_BBOX["west"], JANKIPURAM_BBOX["east"], grid_res)

        radar_matrix = []
        cell_centers = [
            (
                HOTSPOTS["engineering_college_chauraha"]["lat"] + cell_drift_dy + random.uniform(-0.01, 0.01),
                HOTSPOTS["engineering_college_chauraha"]["lon"] + cell_drift_dx + random.uniform(-0.01, 0.01),
                random.uniform(1.2, 1.6),
            ),
            (
                HOTSPOTS["jankipuram_ext_underpass"]["lat"] + cell_drift_dy + random.uniform(-0.008, 0.008),
                HOTSPOTS["jankipuram_ext_underpass"]["lon"] + cell_drift_dx + random.uniform(-0.008, 0.008),
                random.uniform(1.3, 1.8),
            ),
            (
                HOTSPOTS["sector_f_drain"]["lat"] + cell_drift_dy,
                HOTSPOTS["sector_f_drain"]["lon"] + cell_drift_dx,
                random.uniform(1.1, 1.5),
            ),
        ][:num_convective_cells]

        for lat in lats:
            row = []
            for lon in lons:
                # Base rain + Gaussian convective storm cells
                val = base_intensity_mm_hr * random.uniform(0.85, 1.15)
                for c_lat, c_lon, intensity_mult in cell_centers:
                    dist_sq = ((lat - c_lat) ** 2) + ((lon - c_lon) ** 2)
                    cell_gain = math.exp(-dist_sq / (2 * (0.012 ** 2))) * (base_intensity_mm_hr * (intensity_mult - 1.0))
                    val += cell_gain
                
                # Clip to realistic extreme monsoon intensity (10 to 180 mm/hr)
                rain_rate = round(float(np.clip(val, 0.0, 180.0)), 2)
                row.append(rain_rate)
            radar_matrix.append(row)

        radar_payload = {
            "timestamp": "2026-09-04T20:15:00Z",
            "region": "Jankipuram, Lucknow, UP",
            "grid_resolution": f"{grid_res}x{grid_res}",
            "bounds": JANKIPURAM_BBOX,
            "base_intensity_mm_hr": base_intensity_mm_hr,
            "max_detected_intensity_mm_hr": round(float(np.max(radar_matrix)), 2),
            "mean_intensity_mm_hr": round(float(np.mean(radar_matrix)), 2),
            "grid_lats": [round(x, 5) for x in lats.tolist()],
            "grid_lons": [round(y, 5) for y in lons.tolist()],
            "intensity_grid": radar_matrix,
        }

        # Cache live radar snapshot
        radar_file = self.data_dir / "live_radar_grid.json"
        with open(radar_file, "w", encoding="utf-8") as f:
            json.dump(radar_payload, f, indent=2)

        return radar_payload

    def _save_network_cache(self):
        """Save drainage network graph structure to JSON and GeoJSON."""
        if not self.drainage_graph:
            return

        network_dict = nx.node_link_data(self.drainage_graph)
        cache_file = self.models_dir / "drainage_network.json"
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(network_dict, f, indent=2)

        # Also write GeoJSON for visual map inspection
        geojson_features = []
        for node_id, data in self.drainage_graph.nodes(data=True):
            geojson_features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [data["lon"], data["lat"]],
                },
                "properties": {
                    "id": node_id,
                    "name": data.get("name", node_id),
                    "elevation": data.get("ground_elevation_m", 122.0),
                    "depth": data.get("depth_m", 2.0),
                    "capacity_m3": data.get("max_capacity_m3", 10.0),
                    "is_hotspot": data.get("is_hotspot", False),
                    "node_type": data.get("node_type", "manhole"),
                },
            })

        for u, v, data in self.drainage_graph.edges(data=True):
            u_node = self.drainage_graph.nodes[u]
            v_node = self.drainage_graph.nodes[v]
            geojson_features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [u_node["lon"], u_node["lat"]],
                        [v_node["lon"], v_node["lat"]],
                    ],
                },
                "properties": {
                    "from_node": u,
                    "to_node": v,
                    "length_m": data.get("length_m", 50.0),
                    "diameter_m": data.get("diameter_m", 0.8),
                    "slope": data.get("slope", 0.002),
                    "max_discharge_m3_s": data.get("max_discharge_m3_s", 1.5),
                },
            })

        geojson_doc = {
            "type": "FeatureCollection",
            "name": "Jankipuram_Drainage_Network",
            "features": geojson_features,
        }

        with open(self.data_dir / "drainage_network.geojson", "w", encoding="utf-8") as f:
            json.dump(geojson_doc, f, indent=2)
            
        logger.info(f"Drainage network saved to {cache_file} and {self.data_dir / 'drainage_network.geojson'}")

    @staticmethod
    def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Compute great-circle distance between two GPS coordinates in kilometers."""
        r = 6371.0  # Earth radius in km
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(dlon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return r * c


if __name__ == "__main__":
    agent = DataIngestionAgent()
    graph = agent.ingest_road_network()
    radar = agent.simulate_doppler_radar_grid(base_intensity_mm_hr=75.0)
    print(f"[OK] DataIngestionAgent initialized: {len(graph.nodes)} manholes, max radar rain rate: {radar['max_detected_intensity_mm_hr']} mm/hr")
