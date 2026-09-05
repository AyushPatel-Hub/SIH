import React from 'react';
import { BarChart3, Database } from 'lucide-react';

export default function RainfallHistoryChart({ historyData }) {
  const readings = historyData || [];
  const maxRain = Math.max(...readings.map((r) => r.rain_rate_mm_hr || 0), 10);

  return (
    <div className="form-section">
      <div className="form-section-title">
        <span>Precipitation Database Log</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#9ca3af' }}>
          <Database size={12} color="#38bdf8" />
          <span>SQLite Store ({readings.length} records)</span>
        </div>
      </div>

      {readings.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center', padding: '16px' }}>
          No historical telemetry records in database yet.
        </div>
      ) : (
        <div>
          {/* SVG Bar Chart */}
          <div
            style={{
              height: '110px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '4px',
              backgroundColor: '#0b0f19',
              padding: '10px 8px 4px 8px',
              borderRadius: '6px',
              border: '1px solid #262f3d',
              overflowX: 'auto',
            }}
          >
            {readings.slice(-24).map((item, idx) => {
              const val = item.rain_rate_mm_hr || 0;
              const heightPercent = Math.min(100, Math.max(6, (val / maxRain) * 100));
              const isHeavy = val >= 35;
              const isModerate = val > 10 && val < 35;
              const barColor = isHeavy ? '#ef4444' : isModerate ? '#f59e0b' : '#0284c7';

              return (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    minWidth: '10px',
                    height: `${heightPercent}%`,
                    backgroundColor: barColor,
                    borderRadius: '2px 2px 0 0',
                    transition: 'height 0.2s',
                    position: 'relative',
                  }}
                  title={`${item.timestamp}: ${val} mm/hr (${item.source})`}
                />
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '10px',
              color: '#6b7280',
              marginTop: '6px',
            }}
          >
            <span>Past Ingestion Cycles</span>
            <span style={{ color: '#9ca3af' }}>Max: {maxRain.toFixed(1)} mm/hr</span>
            <span>Latest Observation</span>
          </div>
        </div>
      )}
    </div>
  );
}
