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
  Clock,
  Activity,
  Zap,
} from 'lucide-react';

export default function LiveWeatherCard({
  weather,
  onFetchLiveWeather,
  isSyncing,
  onUseInSimulator,
  leadTimeHours = 0,
  onSelectLeadTime,
  forecastCurve = [],
}) {
  const rainRate = weather?.rainRate ?? 0.0;
  const temp = weather?.temperatureC ?? 31.5;
  const feelsLike = weather?.feelsLikeC ?? 37.5;
  const humidity = weather?.humidity ?? 70;
  const windSpeed = weather?.windSpeedKmh ?? 8.3;
  const pressure = weather?.surfacePressureHpa ?? 989.4;
  const weatherDesc = weather?.weatherDesc || 'Clear Sky';
  const weatherCode = weather?.weatherCode || 0;
  const stationName = weather?.stationName || 'IMD Doppler Weather Radar (DWR Lucknow)';
  const timestamp = weather?.timestamp || 'Live Sweep';
  const dbz = weather?.radarReflectivityDbz ?? 12.0;
  const stormVelocity = weather?.stormCellVelocityKmh ?? 18.5;
  const leadLabel = weather?.leadTimeLabel || (leadTimeHours > 0 ? `+${leadTimeHours}h Advance Forecast` : 'Live Scan (T+0)');

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

  // Rain severity badge
  const getRainBadge = (rate) => {
    if (rate >= 50) return { label: 'Cloudburst / Extreme', bg: '#7f1d1d', color: '#f87171' };
    if (rate >= 25) return { label: 'Heavy Monsoon Rain', bg: '#78350f', color: '#fbbf24' };
    if (rate >= 5) return { label: 'Moderate Rain', bg: '#075985', color: '#38bdf8' };
    if (rate > 0) return { label: 'Light Drizzle / Showers', bg: '#064e3b', color: '#34d399' };
    return { label: 'Dry / Below Runoff Trigger', bg: '#1e293b', color: '#94a3b8' };
  };

  // Radar Reflectivity dBZ Styling
  const getDbzBadge = (val) => {
    if (val >= 55) return { label: 'Severe Core (Cloudburst)', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' };
    if (val >= 45) return { label: 'Heavy Convective', color: '#f97316', bg: 'rgba(249, 115, 22, 0.2)' };
    if (val >= 35) return { label: 'Moderate Rain Band', color: '#eab308', bg: 'rgba(234, 179, 8, 0.2)' };
    if (val >= 20) return { label: 'Stratiform / Drizzle', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.2)' };
    return { label: 'Clear Air Echo', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
  };

  const rainBadge = getRainBadge(rainRate);
  const dbzBadge = getDbzBadge(dbz);

  const horizonOptions = [
    { hours: 0, label: 'Live (T+0)', desc: 'Current' },
    { hours: 1, label: '+1h', desc: '60m Lead' },
    { hours: 2, label: '+2h', desc: '120m Lead' },
    { hours: 3, label: '+3h', desc: '180m Lead' },
    { hours: 4, label: '+4h', desc: '240m Lead' },
  ];

  return (
    <div className="form-section live-weather-panel">
      {/* Header with Title and Doppler Radar Badge */}
      <div className="form-section-title" style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Radio size={16} color="#38bdf8" />
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f9fafb' }}>
            Doppler Weather Radar (DWR)
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
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            color: '#38bdf8',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
          }}
        >
          <span className="live-beacon" style={{ backgroundColor: '#38bdf8' }}></span>
          IMD LKO RADAR
        </div>
      </div>

      {/* Station Subtitle & Elevation */}
      <div
        style={{
          fontSize: '11px',
          color: '#9ca3af',
          marginBottom: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '4px',
        }}
      >
        <span>
          <strong>Amausi DWR Station</strong> (26.76°N, 80.88°E) • Beam 0.5°
        </span>
        <span className="font-mono" style={{ fontSize: '10px', color: '#6b7280' }}>
          {timestamp}
        </span>
      </div>

      {/* Advance Forecast Horizon Selector (1-4hr Proactive Warning) */}
      <div
        style={{
          backgroundColor: '#0a0f1d',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '8px 10px',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            fontSize: '10px',
            color: '#94a3b8',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            marginBottom: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Clock size={11} color="#38bdf8" />
            <span>Advance Warning Horizon</span>
          </div>
          <span style={{ color: leadTimeHours > 0 ? '#38bdf8' : '#94a3b8', fontWeight: 600 }}>
            {leadTimeHours > 0 ? `${leadTimeHours}h Proactive Lead Time` : 'Immediate T+0'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
          {horizonOptions.map((opt) => {
            const isSelected = leadTimeHours === opt.hours;
            return (
              <button
                key={opt.hours}
                onClick={() => onSelectLeadTime && onSelectLeadTime(opt.hours)}
                disabled={isSyncing}
                title={`Run nowcast with ${opt.hours} hour advance Doppler radar forecast`}
                style={{
                  background: isSelected
                    ? 'linear-gradient(180deg, rgba(56, 189, 248, 0.25) 0%, rgba(2, 132, 199, 0.4) 100%)'
                    : '#111827',
                  border: isSelected ? '1px solid #38bdf8' : '1px solid #1f2937',
                  color: isSelected ? '#ffffff' : '#9ca3af',
                  borderRadius: '5px',
                  padding: '5px 2px',
                  cursor: isSyncing ? 'not-allowed' : 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 0 8px rgba(56, 189, 248, 0.3)' : 'none',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: '8px', color: isSelected ? '#bae6fd' : '#6b7280', marginTop: '1px' }}>
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sync Doppler Radar Button */}
      <div style={{ marginBottom: '12px' }}>
        <button
          className="btn-fetch-live-weather"
          onClick={() => onFetchLiveWeather && onFetchLiveWeather(leadTimeHours)}
          disabled={isSyncing}
          title="Query IMD Doppler Radar & numerical model for latest convective nowcast"
          style={{
            background: 'linear-gradient(90deg, #0284c7 0%, #0369a1 100%)',
            borderColor: '#38bdf8',
          }}
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
          <span>{isSyncing ? 'Scanning Doppler Radar...' : `Sync Doppler Radar Telemetry (${leadLabel})`}</span>
        </button>
      </div>

      {/* Primary Highlight Banner: Precipitation & Doppler Reflectivity */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#0b0f19',
          border: '1px solid #262f3d',
          borderRadius: '8px',
          padding: '10px 12px',
          marginBottom: '10px',
        }}
      >
        <div>
          <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {leadTimeHours > 0 ? `Projected Rain (+${leadTimeHours}h)` : 'Precipitation Intensity'}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginTop: '2px' }}>
            <span
              className="font-mono"
              style={{
                fontSize: '22px',
                fontWeight: 800,
                color: rainRate > 0 ? '#38bdf8' : '#9ca3af',
              }}
            >
              {rainRate.toFixed(1)}
            </span>
            <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>mm/hr</span>
          </div>
          <div
            style={{
              display: 'inline-block',
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: rainBadge.bg,
              color: rainBadge.color,
              fontWeight: 600,
              marginTop: '4px',
            }}
          >
            {rainBadge.label}
          </div>
        </div>

        {/* Doppler Reflectivity dBZ Badge */}
        <div style={{ textAlign: 'right', borderLeft: '1px solid #1f2937', paddingLeft: '10px' }}>
          <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Radar Reflectivity
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: '4px', marginTop: '2px' }}>
            <span
              className="font-mono"
              style={{
                fontSize: '22px',
                fontWeight: 800,
                color: dbzBadge.color,
              }}
            >
              {dbz.toFixed(1)}
            </span>
            <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>dBZ</span>
          </div>
          <div
            style={{
              display: 'inline-block',
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: dbzBadge.bg,
              color: dbzBadge.color,
              fontWeight: 600,
              marginTop: '4px',
            }}
          >
            {dbzBadge.label}
          </div>
        </div>
      </div>

      {/* 4-Hour Doppler Rain Curve Timeline */}
      {forecastCurve && forecastCurve.length > 0 && (
        <div
          style={{
            backgroundColor: '#0a0e1a',
            border: '1px solid #1e293b',
            borderRadius: '6px',
            padding: '7px 8px',
            marginBottom: '10px',
          }}
        >
          <div
            style={{
              fontSize: '9px',
              color: '#94a3b8',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '4px',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Doppler Convective Curve (Next 5h)</span>
            <span style={{ color: '#38bdf8' }}>Z = 200·R^1.6</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(5, forecastCurve.length)}, 1fr)`, gap: '4px' }}>
            {forecastCurve.slice(0, 5).map((fc, i) => {
              const active = fc.lead_time_hours === leadTimeHours;
              return (
                <div
                  key={i}
                  onClick={() => onSelectLeadTime && onSelectLeadTime(fc.lead_time_hours)}
                  style={{
                    backgroundColor: active ? 'rgba(56, 189, 248, 0.2)' : '#111827',
                    border: active ? '1px solid #38bdf8' : '1px solid #1f2937',
                    borderRadius: '4px',
                    padding: '4px 2px',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '9px', color: '#9ca3af' }}>{fc.time_str}</div>
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: fc.rain_rate_mm_hr > 0 ? '#38bdf8' : '#6b7280',
                      marginTop: '2px',
                    }}
                  >
                    {fc.rain_rate_mm_hr}
                  </div>
                  <div style={{ fontSize: '8px', color: fc.reflectivity_color, fontWeight: 600 }}>
                    {fc.radar_reflectivity_dbz} dBZ
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detailed Meteorological Telemetry Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '6px',
          marginBottom: '10px',
        }}
      >
        {/* Temperature */}
        <div className="weather-metric-tile">
          <div className="weather-metric-header">
            <Thermometer size={11} color="#f59e0b" />
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
            <Droplets size={11} color="#06b6d4" />
            <span>Relative Humidity</span>
          </div>
          <div className="weather-metric-value">
            <span className="font-mono">{humidity}</span>
            <span className="weather-metric-unit">%</span>
          </div>
          <div className="weather-metric-sub">Moisture saturation</div>
        </div>

        {/* Storm Cell Velocity */}
        <div className="weather-metric-tile">
          <div className="weather-metric-header">
            <Wind size={11} color="#a78bfa" />
            <span>Cell Tracking</span>
          </div>
          <div className="weather-metric-value">
            <span className="font-mono">{stormVelocity.toFixed(1)}</span>
            <span className="weather-metric-unit">km/h</span>
          </div>
          <div className="weather-metric-sub">Radar motion vector</div>
        </div>

        {/* Barometric Pressure */}
        <div className="weather-metric-tile">
          <div className="weather-metric-header">
            <Compass size={11} color="#38bdf8" />
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
            padding: '6px',
            borderColor: '#38bdf8',
            color: '#38bdf8',
          }}
          onClick={() => onUseInSimulator(rainRate)}
          title="Transfer current radar precipitation rate into the Scenario Simulator"
        >
          <Sliders size={12} />
          Load Radar Rain ({rainRate.toFixed(1)} mm/h) in Simulator
        </button>
      )}
    </div>
  );
}
