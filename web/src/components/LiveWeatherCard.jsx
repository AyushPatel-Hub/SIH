import React from 'react';
import {
  CloudRain,
  CloudDrizzle,
  CloudLightning,
  Sun,
  Wind,
  Droplets,
  Thermometer,
  Compass,
  RefreshCw,
  Radio,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

export default function LiveWeatherCard({
  weather,
  onFetchLiveWeather,
  isSyncing,
  onUseInSimulator,
}) {
  const rainRate = weather?.rainRate ?? 0.0;
  const temp = weather?.temperatureC ?? 31.5;
  const feelsLike = weather?.feelsLikeC ?? 37.5;
  const humidity = weather?.humidity ?? 70;
  const windSpeed = weather?.windSpeedKmh ?? 8.3;
  const pressure = weather?.surfacePressureHpa ?? 989.4;
  const weatherDesc = weather?.weatherDesc || 'Clear Sky';
  const weatherCode = weather?.weatherCode || 0;
  const stationName = weather?.stationName || 'Jankipuram Meteorological Node';
  const timestamp = weather?.timestamp || 'Live Stream';

  // Weather icon picker
  const getWeatherIcon = (code) => {
    if ([95, 96, 99].includes(code)) {
      return <CloudLightning size={20} color="#f59e0b" />;
    }
    if ([61, 63, 65, 80, 81, 82].includes(code)) {
      return <CloudRain size={20} color="#38bdf8" />;
    }
    if ([51, 53, 55].includes(code)) {
      return <CloudDrizzle size={20} color="#06b6d4" />;
    }
    return <Sun size={20} color="#fbbf24" />;
  };

  // Rain severity pill styling
  const getRainBadge = (rate) => {
    if (rate >= 50) return { label: 'Cloudburst / Extreme', bg: '#7f1d1d', color: '#f87171' };
    if (rate >= 25) return { label: 'Heavy Monsoon Rain', bg: '#78350f', color: '#fbbf24' };
    if (rate >= 5) return { label: 'Moderate Rain', bg: '#075985', color: '#38bdf8' };
    if (rate > 0) return { label: 'Light Drizzle / Showers', bg: '#064e3b', color: '#34d399' };
    return { label: 'No Rain / Dry Catchment', bg: '#1e293b', color: '#94a3b8' };
  };

  const rainBadge = getRainBadge(rainRate);

  return (
    <div className="form-section live-weather-panel">
      {/* Header with Title and Live Badge */}
      <div className="form-section-title" style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {getWeatherIcon(weatherCode)}
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f9fafb' }}>
            Live Meteorological Station
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '10px',
            padding: '3px 8px',
            borderRadius: '12px',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#34d399',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
          }}
        >
          <span className="live-beacon"></span>
          OPEN-METEO LIVE
        </div>
      </div>

      {/* Station Subtitle & Coordinates */}
      <div
        style={{
          fontSize: '11px',
          color: '#9ca3af',
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '4px',
        }}
      >
        <span>
          <strong>{stationName}</strong> (26.924° N, 80.942° E)
        </span>
        <span className="font-mono" style={{ fontSize: '10px', color: '#6b7280' }}>
          {timestamp}
        </span>
      </div>

      {/* Main Action: Prominent Fetch Real-Time Live Weather Button */}
      <div style={{ marginBottom: '14px' }}>
        <button
          className="btn-fetch-live-weather"
          onClick={onFetchLiveWeather}
          disabled={isSyncing}
          title="Query Open-Meteo for real-time weather at Jankipuram and run flood nowcast"
        >
          <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
          <span>{isSyncing ? 'Fetching Real-Time Weather...' : 'Fetch Real-Time Live Weather Data'}</span>
        </button>
      </div>

      {/* Primary Highlight Banner: Current Weather & Rain Rate */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#0b0f19',
          border: '1px solid #262f3d',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Precipitation Intensity
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
            <span
              className="font-mono"
              style={{
                fontSize: '24px',
                fontWeight: 800,
                color: rainRate > 0 ? '#38bdf8' : '#9ca3af',
              }}
            >
              {rainRate.toFixed(1)}
            </span>
            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600 }}>mm/hr</span>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              display: 'inline-block',
              fontSize: '11px',
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: rainBadge.bg,
              color: rainBadge.color,
              fontWeight: 600,
              marginBottom: '4px',
            }}
          >
            {rainBadge.label}
          </div>
          <div style={{ fontSize: '11px', color: '#d1d5db' }}>
            Condition: <strong>{weatherDesc}</strong>
          </div>
        </div>
      </div>

      {/* Detailed Meteorological Telemetry Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        {/* Temperature */}
        <div className="weather-metric-tile">
          <div className="weather-metric-header">
            <Thermometer size={12} color="#f59e0b" />
            <span>Ambient Temp</span>
          </div>
          <div className="weather-metric-value">
            <span className="font-mono">{temp.toFixed(1)}</span>
            <span className="weather-metric-unit">°C</span>
          </div>
          <div className="weather-metric-sub">Feels like {feelsLike.toFixed(1)} °C</div>
        </div>

        {/* Humidity */}
        <div className="weather-metric-tile">
          <div className="weather-metric-header">
            <Droplets size={12} color="#06b6d4" />
            <span>Relative Humidity</span>
          </div>
          <div className="weather-metric-value">
            <span className="font-mono">{humidity}</span>
            <span className="weather-metric-unit">%</span>
          </div>
          <div className="weather-metric-sub">Moisture saturation</div>
        </div>

        {/* Wind Speed */}
        <div className="weather-metric-tile">
          <div className="weather-metric-header">
            <Wind size={12} color="#a78bfa" />
            <span>Wind Speed</span>
          </div>
          <div className="weather-metric-value">
            <span className="font-mono">{windSpeed.toFixed(1)}</span>
            <span className="weather-metric-unit">km/h</span>
          </div>
          <div className="weather-metric-sub">Surface breeze</div>
        </div>

        {/* Barometric Pressure */}
        <div className="weather-metric-tile">
          <div className="weather-metric-header">
            <Compass size={12} color="#38bdf8" />
            <span>Surface Pressure</span>
          </div>
          <div className="weather-metric-value">
            <span className="font-mono">{pressure.toFixed(1)}</span>
            <span className="weather-metric-unit">hPa</span>
          </div>
          <div className="weather-metric-sub">Basin barometer</div>
        </div>
      </div>

      {/* Simulator Quick Action */}
      {onUseInSimulator && (
        <button
          className="btn-secondary"
          style={{
            width: '100%',
            justifyContent: 'center',
            fontSize: '11px',
            padding: '7px',
            borderColor: '#38bdf8',
            color: '#38bdf8',
          }}
          onClick={() => onUseInSimulator(rainRate)}
          title="Transfer current live precipitation rate into the Scenario Simulator"
        >
          <Sliders size={12} />
          Load Live Rain ({rainRate.toFixed(1)} mm/h) in Simulator
        </button>
      )}
    </div>
  );
}
