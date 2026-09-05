import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import TelemetryStats from './components/TelemetryStats';
import MapView from './components/MapView';
import EvacuationRouter from './components/EvacuationRouter';
import RainfallHistoryChart from './components/RainfallHistoryChart';
import HotspotsTable from './components/HotspotsTable';
import AlertFeed from './components/AlertFeed';
import ScenarioSimulator from './components/ScenarioSimulator';
import { Activity, Navigation, MapPin, Bell, Sliders, Database } from 'lucide-react';

export default function App() {
  // Operational Modes: 'live' (auto-ingest from DB) or 'sim' (what-if scenario)
  const [activeMode, setActiveMode] = useState('live');
  const [activeTab, setActiveTab] = useState('telemetry');

  // Telemetry & State
  const [telemetry, setTelemetry] = useState({
    rainRate: 0.0,
    accumulated1h: 0.0,
    maxDepth: 0.0,
    closedRoads: 0,
    latencyMs: 3.8,
    systemStatus: 'NORMAL_CONDITIONS',
    sourceName: 'Open-Meteo API',
  });

  const [floodMapData, setFloodMapData] = useState(null);
  const [hotspots, setHotspots] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [routeResult, setRouteResult] = useState(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isComputingRoute, setIsComputingRoute] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // 1. Initial Data Fetch & Polling
  const fetchLiveState = useCallback(async () => {
    try {
      // Fetch Live Rainfall from SQLite DB
      const rainRes = await fetch('/api/rainfall/live');
      if (rainRes.ok) {
        const data = await rainRes.json();
        const reading = data.latest_reading;
        const nowcast = data.last_nowcast_state;

        if (reading) {
          setTelemetry((prev) => ({
            ...prev,
            rainRate: reading.rain_rate_mm_hr || 0.0,
            accumulated1h: reading.rain_accumulated_1h_mm || 0.0,
            sourceName: reading.source || 'Database Feed',
          }));
        }

        if (nowcast && nowcast.metrics) {
          setTelemetry((prev) => ({
            ...prev,
            maxDepth: nowcast.metrics.max_predicted_flood_depth_m || 0.0,
            closedRoads: nowcast.road_status?.closed_segments || 0,
            latencyMs: nowcast.total_latency_ms || 3.8,
            systemStatus: nowcast.system_status || 'MONITORED',
          }));
          if (nowcast.alerts) {
            setAlerts(nowcast.alerts);
          }
        }
      }

      // Fetch Rainfall History
      const histRes = await fetch('/api/rainfall/history?limit=30');
      if (histRes.ok) {
        const hist = await histRes.json();
        setHistoryData(hist.readings || []);
      }

      // Fetch Hotspots
      const spotsRes = await fetch('/hotspots');
      if (spotsRes.ok) {
        const spots = await spotsRes.json();
        setHotspots(spots.hotspots || {});
      }

      // Fetch Flood Map GeoJSON
      const mapRes = await fetch('/flood_map');
      if (mapRes.ok) {
        const geojson = await mapRes.json();
        setFloodMapData(geojson);
      }
    } catch (err) {
      console.error('Error fetching live EOC state:', err);
    }
  }, []);

  useEffect(() => {
    fetchLiveState();

    // Auto-refresh telemetry every 20 seconds
    const interval = setInterval(() => {
      fetchLiveState();
    }, 20000);

    return () => clearInterval(interval);
  }, [fetchLiveState]);

  // 2. Force Sync Weather Now
  const handleSyncLiveWeather = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/rainfall/sync-now', { method: 'POST' });
      if (res.ok) {
        await fetchLiveState();
      }
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // 3. Compute Evacuation Route
  const handleComputeRoute = async (coords) => {
    setIsComputingRoute(true);
    try {
      const res = await fetch('/safe_route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords),
      });
      if (res.ok) {
        const data = await res.json();
        setRouteResult(data);
      }
    } catch (err) {
      console.error('Route calculation failed:', err);
    } finally {
      setIsComputingRoute(false);
    }
  };

  const handleClearRoute = () => {
    setRouteResult(null);
  };

  // 4. Run Scenario Simulation
  const handleRunSimulation = async (simParams) => {
    setIsSimulating(true);
    try {
      const res = await fetch('/predict_flooding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simParams),
      });
      if (res.ok) {
        const data = await res.json();
        setTelemetry({
          rainRate: simParams.rain_intensity_mm_hr,
          accumulated1h: simParams.rain_intensity_mm_hr * simParams.duration_hrs,
          maxDepth: data.metrics?.max_predicted_flood_depth_m || 0.0,
          closedRoads: data.road_status?.closed_segments || 0,
          latencyMs: data.total_latency_ms || 4.2,
          systemStatus: data.system_status || 'SIMULATION_ACTIVE',
          sourceName: 'Synthetic Stress Scenario',
        });
        if (data.alerts) setAlerts(data.alerts);

        // Refresh flood map
        const mapRes = await fetch('/flood_map');
        if (mapRes.ok) {
          const geojson = await mapRes.json();
          setFloodMapData(geojson);
        }
      }
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  // When mode changes to 'sim', auto-switch tab to simulator
  const handleModeChange = (mode) => {
    setActiveMode(mode);
    if (mode === 'sim') {
      setActiveTab('simulator');
    } else {
      setActiveTab('telemetry');
      fetchLiveState();
    }
  };

  return (
    <div className="eoc-app-container">
      {/* 1. Top EOC Header */}
      <Header
        activeMode={activeMode}
        setActiveMode={handleModeChange}
        onSyncLiveWeather={handleSyncLiveWeather}
        isSyncing={isSyncing}
        systemStatus={telemetry.systemStatus}
      />

      {/* 2. Top Executive Telemetry Bar */}
      <TelemetryStats
        rainRate={telemetry.rainRate}
        accumulated1h={telemetry.accumulated1h}
        maxDepth={telemetry.maxDepth}
        closedRoads={telemetry.closedRoads}
        latencyMs={telemetry.latencyMs}
        systemStatus={telemetry.systemStatus}
        sourceName={telemetry.sourceName}
      />

      {/* 3. Main Split Operational Workspace */}
      <div className="operational-body">
        {/* Left Command & Telemetry Dock */}
        <div className="command-panel">
          {/* Tab Navigation */}
          <div className="panel-tabs">
            <button
              className={`panel-tab-btn ${activeTab === 'telemetry' ? 'active' : ''}`}
              onClick={() => setActiveTab('telemetry')}
            >
              <Activity size={13} />
              Telemetry
            </button>
            <button
              className={`panel-tab-btn ${activeTab === 'routing' ? 'active' : ''}`}
              onClick={() => setActiveTab('routing')}
            >
              <Navigation size={13} />
              Routing
            </button>
            <button
              className={`panel-tab-btn ${activeTab === 'hotspots' ? 'active' : ''}`}
              onClick={() => setActiveTab('hotspots')}
            >
              <MapPin size={13} />
              Hotspots
            </button>
            <button
              className={`panel-tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
              onClick={() => setActiveTab('alerts')}
            >
              <Bell size={13} />
              Alerts ({alerts.length})
            </button>
            {activeMode === 'sim' && (
              <button
                className={`panel-tab-btn ${activeTab === 'simulator' ? 'active' : ''}`}
                onClick={() => setActiveTab('simulator')}
              >
                <Sliders size={13} />
                Simulator
              </button>
            )}
          </div>

          {/* Tab Content Area */}
          <div className="panel-scroll-content">
            {activeTab === 'telemetry' && (
              <>
                <RainfallHistoryChart historyData={historyData} />
                <AlertFeed alerts={alerts} />
              </>
            )}

            {activeTab === 'routing' && (
              <EvacuationRouter
                hotspots={hotspots}
                onComputeRoute={handleComputeRoute}
                isComputing={isComputingRoute}
                routeResult={routeResult}
                onClearRoute={handleClearRoute}
              />
            )}

            {activeTab === 'hotspots' && (
              <HotspotsTable hotspots={hotspots} />
            )}

            {activeTab === 'alerts' && (
              <AlertFeed alerts={alerts} />
            )}

            {activeTab === 'simulator' && (
              <ScenarioSimulator
                onRunSimulation={handleRunSimulation}
                isSimulating={isSimulating}
              />
            )}
          </div>
        </div>

        {/* Right 3D Map View */}
        <MapView
          floodMapData={floodMapData}
          routeData={routeResult}
          hotspots={hotspots}
        />
      </div>
    </div>
  );
}
