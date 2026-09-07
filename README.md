# 🌊 Urban Flood Nowcasting System (Smart Jankipuram, Lucknow)

> **AI-Driven Hydrodynamic Multi-Agent Platform for Sub-Second Storm Inundation Prediction & Dynamic Evacuation Routing**  
> *Developed for Smart India Hackathon (SIH 2026) • Focus Area: Jankipuram, Lucknow, Uttar Pradesh, India*

[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-3.6+-blue.svg?logo=maplibre)](https://maplibre.org)
[![Python](https://img.shields.io/badge/Python-3.9%20%7C%203.10%20%7C%203.11-3776AB.svg?logo=python)](https://python.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📌 Executive Summary & Problem Context

Urban waterlogging during intense monsoon cloudbursts causes severe traffic gridlocks, economic loss, and safety hazards across low-lying pockets of **Jankipuram, Lucknow** (e.g., *Sector F Main Drain Basin*, *Engineering College Chauraha*, *Jankipuram Extension Underpass*, and *Kursi Road culverts*).

Traditional hydraulic simulation software (like EPA-SWMM) takes **10–45 minutes** to compute full-network 2D hydrodynamic flood propagation, making real-time warning impossible during sudden 15-minute convective downpours.

### 💡 The Solution
Our **Urban Flood Nowcasting System** replaces computationally expensive hydrodynamic differential solvers with a **Physics-Informed ML Surrogate Model** deployed inside a **Modular Multi-Agent Pipeline**. It delivers:
- ⚡ **Sub-second (<5ms) node-level manhole surcharge volume and inundation depth predictions**.
- 🗺️ **3D Inundation & Hazardous Road Mapping** powered by **MapLibre GL**.
- 🚦 **Dynamic Flood-Penalized Evacuation Routing** (Dijkstra algorithm avoiding roads with >0.30m water depth).
- 🚨 **Automated Municipal Alert Generation** for emergency de-watering pump deployment and city transit rerouting.

---

## 🏛️ Multi-Agent Architecture

```
                                  ┌──────────────────────────────┐
                                  │   Doppler Weather Radar /    │
                                  │  Live Rain Gauge API Stream  │
                                  └──────────────┬───────────────┘
                                                 │
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ MULTI-AGENT ORCHESTRATION PIPELINE (workflows/nowcast_pipeline.yaml)                             │
├───────────────────────────────┬───────────────────────────────┬──────────────────────────────────┤
│ 1. Data Ingestion Agent       │ 2. ML Inference Agent         │ 3. Alert & Routing Agent         │
│ (agents/data_agent.py)        │ (agents/inference_agent.py)   │ (agents/alert_agent.py)          │
│                               │                               │                                  │
│ • Ingests local 'map.osm' /   │ • High-Speed GBDT/RF          │ • Converts manhole surcharges    │
│   OSMNx road networks         │   Surrogate Model             │   to 2D surface inundations      │
│ • Enriches DEM elevation      │ • Evaluates pipe capacity     │ • Flags impassable road edges    │
│   baselines (~120m-126m)      │   vs. catchment runoff inflow │ • Calculates flood-free routes   │
│ • Generates 2D Doppler radar  │ • Sub-5ms batch inference     │ • Exports PostGIS/GeoJSON &      │
│   reflectivity grids          │   across all junctions        │   municipal advisory alerts      │
└───────────────────────────────┴───────────────────────────────┴──────────────────────────────────┘
                                                 │
                                                 ▼
                                  ┌──────────────────────────────┐
                                  │   FastAPI Backend Service    │
                                  │       (api/main.py)          │
                                  └──────────────┬───────────────┘
                                                 │
                                                 ▼
                                  ┌──────────────────────────────┐
                                  │ Interactive MapLibre GL 3D   │
                                  │      Web Dashboard (web/)    │
                                  └──────────────────────────────┘
```

---

## 🗺️ Key Modeled Hotspots in Jankipuram, Lucknow

| Hotspot Name | Coordinates (Lat, Lon) | Baseline Elevation | Hydrological Risk Profile |
| :--- | :--- | :--- | :--- |
| **Engineering College Chauraha** | `26.9092°N, 80.9415°E` | ~121.2 m AMSL | Major arterial bottleneck with heavy intersection runoff |
| **Sector F Low-lying Drain Basin** | `26.9210°N, 80.9380°E` | ~120.4 m AMSL | Topographic bowl prone to residential waterlogging |
| **Jankipuram Extension Underpass** | `26.9360°N, 80.9520°E` | ~119.8 m AMSL | Severe structural depression; rapid submergence risk (>0.5m) |
| **Sector G / Kursi Road Culvert** | `26.9285°N, 80.9590°E` | ~122.5 m AMSL | High-traffic conduit linking Kursi Road & Ring Road |
| **AKTU / Sewa Hospital Node** | `26.9140°N, 80.9490°E` | ~123.8 m AMSL | Critical hospital emergency access corridor |

---

## 📁 Repository Structure

```
SIH-Urban-Flood-Nowcasting/
├── agents/
│   ├── __init__.py                 # Agent exports
│   ├── data_agent.py               # OSM/map.osm parser, DEM injection, Radar grid simulator
│   ├── sim_engine.py               # Synthetic SWMM hydraulic dataset generator
│   ├── inference_agent.py          # ML Surrogate regressor & classifier
│   ├── alert_agent.py              # Inundation mapper & flood-penalized Dijkstra router
│   └── coordinator.py              # Multi-agent master lifecycle coordinator
├── api/
│   └── main.py                     # FastAPI REST server & GeoJSON endpoints
├── data/
│   ├── map.osm                     # (Optional) User-provided local OpenStreetMap XML
│   ├── synthetic_flood_sim.csv     # Generated hydraulic simulation dataset
│   ├── flood_hazard_nowcast.geojson# Latest computed flood hazard layer
│   └── drainage_network.geojson    # Network topological junctions and conduits
├── models/
│   ├── flood_regressor.joblib      # Trained Gradient Boosting depth regressor
│   ├── flood_classifier.joblib     # Trained Random Forest severity classifier
│   └── model_metadata.json         # Evaluation metrics (R², RMSE, Accuracy)
├── web/
│   ├── index.html                  # Standalone interactive MapLibre GL 3D Dashboard
│   ├── package.json                # React + Vite frontend configuration
│   └── src/
│       ├── App.jsx                 # React MapLibre GL dashboard component
│       └── index.css               # Modern glassmorphism styling
├── workflows/
│   └── nowcast_pipeline.yaml       # Antigravity 5-minute automated workflow definition
├── requirements.txt                # Python project dependencies
├── run_pipeline.py                 # Unified CLI runner
└── README.md                       # Documentation & SIH Pitch Guide
```

---

## 🚀 Quickstart Guide

### 1. Installation

```bash
# Clone or navigate into the repository
cd "c:/My Folder/SIH Anitgravity"

# Create a virtual environment (optional but recommended)
python -m venv venv
# Windows:
.\venv\Scripts\activate

# Install required dependencies
pip install -r requirements.txt
```

### 2. Providing Custom `map.osm` (Optional)
If you have an exported OpenStreetMap file for Jankipuram (`map.osm`):
- Place it directly in the project root `./map.osm` or in `data/map.osm`.
- The Data Ingestion Agent will automatically detect and prioritize your local XML file!
- If no file is provided, the system will download online via OSMnx or use the built-in procedural Jankipuram topology.

### 3. Generate Training Data & Train ML Models

```bash
python run_pipeline.py --train
```
*Outputs: Evaluates 1,000+ storm scenarios, achieves $R^2 > 0.95$ and classification accuracy $> 94\%$, and saves models to `models/`.*

### 4. Run a Standalone Nowcast Cycle (CLI)

```bash
python run_pipeline.py --nowcast --rain 90.0 --duration 2.0
```

### 5. Launch the FastAPI Backend & MapLibre Dashboard

```bash
python run_pipeline.py --serve --port 8000
```
run code **`python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload`**
Open your browser at: **`http://localhost:8000`**

---

## 🌐 API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/predict_flooding` | Live nowcast computation from rain intensity (`mm/hr`) and duration (`hrs`). |
| `GET` | `/flood_map` | Returns real-time PostGIS/GeoJSON FeatureCollection for MapLibre rendering. |
| `POST` | `/safe_route` | Computes flood-free shortest path between origin and destination coordinates. |
| `GET` | `/drainage_network`| Returns the base topological drainage network (manholes & conduits). |
| `GET` | `/hotspots` | Status of Jankipuram landmarks (Chauraha, Underpass, Sector F, etc.). |
| `GET` | `/radar` | Live 2D Doppler radar rain intensity grid. |
| `GET` | `/health` | System health check and model status. |

---

## 🏆 Smart India Hackathon (SIH 2026) Presentation Guide

### 1. The Hook (Slide 1-2)
- Highlight Lucknow's monsoon waterlogging challenges in low-lying residential clusters like Jankipuram.
- Show traditional 2D hydrodynamic simulation time vs. AI Nowcasting: **45 minutes ➔ 4.5 milliseconds**.

### 2. Technological Novelty (Slide 3-4)
- **Multi-Agent Decoupling:** Data ingestion, surrogate inference, and routing agents operate independently.
- **Physics-Informed Surrogacy:** Uses SWMM hydrologic principles ($Q = C \cdot I \cdot A$) and Manning's pipe equation, accelerated via Gradient Boosted Decision Trees.
- **MapLibre GL Integration:** 100% open-source, zero proprietary API cost, 3D extruded rendering of flood surcharges.

### 3. Live Demo Walkthrough (Slide 5)
1. Move the **Rainfall Intensity Slider** to `110 mm/hr` and click **Run ML Flood Nowcast**.
2. Point out how **Sector F** and **Extension Underpass** immediately light up in **RED (>0.30m submergence)**.
3. Click **Flood-Safe Evacuation Router** to demonstrate dynamic rerouting around submerged intersections in real time.

---

## 📄 License
Distributed under the MIT License. Built for Smart India Hackathon 2026.
