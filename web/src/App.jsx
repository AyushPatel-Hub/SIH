import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import TelemetryStats from './components/TelemetryStats';
import LiveWeatherCard from './components/LiveWeatherCard';
import MapView from './components/MapView';
import EvacuationRouter from './components/EvacuationRouter';
import RainfallHistoryChart from './components/RainfallHistoryChart';
import HotspotsTable from './components/HotspotsTable';
import AlertFeed from './components/AlertFeed';
import ScenarioSimulator from './components/ScenarioSimulator';
import { Activity, Navigation, MapPin, Bell, Sliders, Database, CheckCircle2 } from 'lucide-react';

export default function App() {
  // Operational Modes: 'live' (auto-ingest from DB) or 'sim' (what-if scenario)
  const [activeMode, setActiveMode] = useState('live');
  const [activeTab, setActiveTab] = useState('telemetry');

  // Comprehensive Live Weather State
  const [radarLeadTime, setRadarLeadTime] = useState(0);
  const [forecastCurve, setForecastCurve] = useState([]);
  const [weatherData, setWeatherData] = useState({
    rainRate: 0.1,
    accumulated1h: 0.0,
    temperatureC: 31.5,
    feelsLikeC: 37.5,
    humidity: 70,
    surfacePressureHpa: 989.4,
    windSpeedKmh: 8.3,
    weatherDesc: 'Light Drizzle',
    weatherCode: 51,
    stationName: 'IMD Doppler Weather Radar (DWR Lucknow)',
    source: 'IMD Doppler Weather Radar (DWR-LKO)',
    timestamp: 'Live Stream',
    isLive: true,
    radarReflectivityDbz: 12.0,
    stormCellVelocityKmh: 18.5,
    leadTimeHours: 0,
    leadTimeLabel: 'Live Scan (T+0)',
  });

  // Telemetry & State
  const [telemetry, setTelemetry] = useState({
    rainRate: 0.1,
    accumulated1h: 0.0,
    maxDepth: 0.0,
    closedRoads: 0,
    latencyMs: 3.8,
    systemStatus: 'NORMAL_CONDITIONS',
    sourceName: 'IMD Doppler Radar (DWR)',
  });

  const [floodMapData, setFloodMapData] = useState(null);
  const [hotspots, setHotspots] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [routeResult, setRouteResult] = useState(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isComputingRoute, setIsComputingRoute] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // 1. Initial Data Fetch & Polling
  const fetchLiveState = useCallback(async (leadTime = radarLeadTime) => {
    try {
      // Fetch Doppler Radar & Live Rainfall from SQLite DB
      const rainRes = await fetch(`/api/rainfall/live?lead_time_hours=${leadTime}`);
      if (rainRes.ok) {
        const data = await rainRes.json();
        const reading = data.latest_reading;
        const nowcast = data.last_nowcast_state;
        const wInfo = data.weather_info || {};

        if (data.forecast_curve) {
          setForecastCurve(data.forecast_curve);
        }

        setWeatherData((prev) => ({
          ...prev,
          rainRate: wInfo.rain_rate_mm_hr ?? reading?.rain_rate_mm_hr ?? 0.0,
          accumulated1h: wInfo.rain_accumulated_1h_mm ?? reading?.rain_accumulated_1h_mm ?? 0.0,
          weatherDesc: wInfo.weather_desc || reading?.weather_desc || 'Clear Sky',
          weatherCode: wInfo.weather_code || reading?.weather_code || 0,
          stationName: wInfo.station_name || 'IMD Doppler Weather Radar (DWR Lucknow)',
          source: wInfo.source || 'IMD Doppler Radar',
          timestamp: wInfo.timestamp || reading?.timestamp || prev.timestamp,
          temperatureC: wInfo.temperature_c ?? prev.temperatureC,
          feelsLikeC: wInfo.feels_like_c ?? prev.feelsLikeC,
          humidity: wInfo.humidity ?? prev.humidity,
          surfacePressureHpa: wInfo.surface_pressure_hpa ?? prev.surfacePressureHpa,
          windSpeedKmh: wInfo.wind_speed_kmh ?? prev.windSpeedKmh,
          radarReflectivityDbz: wInfo.radar_reflectivity_dbz ?? prev.radarReflectivityDbz,
          stormCellVelocityKmh: wInfo.storm_cell_velocity_kmh ?? prev.stormCellVelocityKmh,
          leadTimeHours: wInfo.lead_time_hours ?? leadTime,
          leadTimeLabel: wInfo.lead_time_label || (leadTime > 0 ? `+${leadTime}h Advance Forecast` : 'Live Scan (T+0)'),
          isLive: true,
        }));

        setTelemetry((prev) => ({
          ...prev,
          rainRate: wInfo.rain_rate_mm_hr ?? reading?.rain_rate_mm_hr ?? 0.0,
          accumulated1h: wInfo.rain_accumulated_1h_mm ?? reading?.rain_accumulated_1h_mm ?? 0.0,
          sourceName: wInfo.source || 'IMD Doppler Radar Feed',
        }));

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
  }, [radarLeadTime]);

  useEffect(() => {
    fetchLiveState(radarLeadTime);

    // Auto-refresh telemetry every 20 seconds
    const interval = setInterval(() => {
      fetchLiveState(radarLeadTime);
    }, 20000);

    return () => clearInterval(interval);
  }, [fetchLiveState, radarLeadTime]);

  // 2. Explicit Fetch Doppler Radar Now
  const handleFetchLiveWeather = async (targetLead = radarLeadTime) => {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/rainfall/sync-now?lead_time_hours=${targetLead}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const liveW = data.weather || data.data?.live_weather;

        if (liveW) {
          setWeatherData({
            rainRate: liveW.rain_rate_mm_hr ?? 0.0,
            accumulated1h: liveW.rain_accumulated_1h_mm ?? 0.0,
            temperatureC: liveW.temperature_c ?? 31.5,
            feelsLikeC: liveW.feels_like_c ?? 37.5,
            humidity: liveW.humidity ?? 70,
            surfacePressureHpa: liveW.surface_pressure_hpa ?? 989.4,
            windSpeedKmh: liveW.wind_speed_kmh ?? 8.3,
            weatherDesc: liveW.weather_desc || 'Normal',
            weatherCode: liveW.weather_code || 0,
            stationName: liveW.station_name || 'IMD Doppler Weather Radar',
            source: liveW.source || 'IMD Doppler Radar (DWR)',
            timestamp: liveW.timestamp || new Date().toLocaleTimeString(),
            radarReflectivityDbz: liveW.radar_reflectivity_dbz ?? 12.0,
            stormCellVelocityKmh: liveW.storm_cell_velocity_kmh ?? 18.5,
            leadTimeHours: liveW.lead_time_hours ?? targetLead,
            leadTimeLabel: liveW.lead_time_label || (targetLead > 0 ? `+${targetLead}h Advance Forecast` : 'Live Scan (T+0)'),
            isLive: true,
          });

          if (liveW.forecast_curve) {
            setForecastCurve(liveW.forecast_curve);
          }

          const leadText = targetLead > 0 ? `(+${targetLead}h Advance)` : '(Live T+0)';
          setToastMessage(
            `Doppler Radar Ingested ${leadText}: ${Number(liveW.rain_rate_mm_hr).toFixed(1)} mm/hr, ${liveW.radar_reflectivity_dbz} dBZ (${liveW.weather_desc})`
          );
        } else {
          setToastMessage('Doppler Radar query successful and nowcast updated.');
        }

        await fetchLiveState(targetLead);
        setTimeout(() => setToastMessage(null), 4500);
      }
    } catch (err) {
      console.error('Fetch Doppler radar failed:', err);
      setToastMessage('Doppler radar fetch failed: Connection error.');
      setTimeout(() => setToastMessage(null), 4500);
    } finally {
      setIsSyncing(false);
    }
  };

  // 2b. Handle Selecting a New Advance Lead Time Horizon
  const handleSelectLeadTime = (newLeadHours) => {
    setRadarLeadTime(newLeadHours);
    handleFetchLiveWeather(newLeadHours);
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
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="eoc-toast-banner">
          <CheckCircle2 size={16} color="#34d399" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Top EOC Header */}
      <Header
        activeMode={activeMode}
        setActiveMode={handleModeChange}
        onSyncLiveWeather={handleFetchLiveWeather}
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
        weatherDesc={weatherData.weatherDesc}
        temperatureC={weatherData.temperatureC}
        onFetchLiveWeather={handleFetchLiveWeather}
        isSyncing={isSyncing}
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
                <LiveWeatherCard
                  weather={weatherData}
                  onFetchLiveWeather={handleFetchLiveWeather}
                  isSyncing={isSyncing}
                  leadTimeHours={radarLeadTime}
                  onSelectLeadTime={handleSelectLeadTime}
                  forecastCurve={forecastCurve}
                  onUseInSimulator={() => {
                    setActiveMode('sim');
                    setActiveTab('simulator');
                  }}
                />
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
                liveRainRate={weatherData.rainRate}
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
