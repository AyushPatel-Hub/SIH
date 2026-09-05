import React, { useState } from 'react';
import { Sliders, Zap, AlertTriangle } from 'lucide-react';

export default function ScenarioSimulator({ onRunSimulation, isSimulating, liveRainRate }) {
  const [rainRate, setRainRate] = useState(liveRainRate ? Math.max(10, Math.round(liveRainRate)) : 90);
  const [duration, setDuration] = useState(1.5);
  const [amc, setAmc] = useState(2);

  const handleSim = () => {
    onRunSimulation({
      rain_intensity_mm_hr: Number(rainRate),
      duration_hrs: Number(duration),
      amc_level: Number(amc),
    });
  };

  return (
    <div className="form-section">
      <div className="form-section-title">
        <span>Cloudburst Scenario Simulator</span>
        <Sliders size={14} color="#06b6d4" />
      </div>

      <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '12px' }}>
        Evaluate urban hydraulic surcharge and road closures under synthetic or extreme meteorological stress tests.
      </p>

      {/* Preset Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '14px' }}>
        <button
          className="btn-secondary"
          style={{ fontSize: '10px', padding: '6px 2px', justifyContent: 'center', borderColor: '#38bdf8', color: '#38bdf8' }}
          onClick={() => { setRainRate(Math.max(5, liveRainRate ?? 0.1)); setDuration(1.0); }}
          title="Use current real-time live rain intensity"
        >
          Live ({Number(liveRainRate ?? 0.1).toFixed(1)}mm/h)
        </button>
        <button
          className="btn-secondary"
          style={{ fontSize: '10px', padding: '6px 2px', justifyContent: 'center' }}
          onClick={() => { setRainRate(35); setDuration(1.0); }}
        >
          Moderate (35mm/h)
        </button>
        <button
          className="btn-secondary"
          style={{ fontSize: '10px', padding: '6px 2px', justifyContent: 'center' }}
          onClick={() => { setRainRate(85); setDuration(1.5); }}
        >
          Intense (85mm/h)
        </button>
        <button
          className="btn-secondary"
          style={{ fontSize: '10px', padding: '6px 2px', justifyContent: 'center', borderColor: '#ef4444', color: '#f87171' }}
          onClick={() => { setRainRate(135); setDuration(2.0); }}
        >
          Extreme (135mm/h)
        </button>
      </div>

      {/* Sliders */}
      <div className="form-group">
        <div className="form-label">
          <span>Synthetic Rain Intensity</span>
          <span className="font-mono" style={{ color: '#06b6d4', fontWeight: 600 }}>
            {rainRate} mm/hr
          </span>
        </div>
        <input
          type="range"
          min="10"
          max="180"
          step="5"
          value={rainRate}
          onChange={(e) => setRainRate(e.target.value)}
          className="range-slider"
        />
      </div>

      <div className="form-group">
        <div className="form-label">
          <span>Storm Event Duration</span>
          <span className="font-mono" style={{ color: '#06b6d4', fontWeight: 600 }}>
            {duration} hrs
          </span>
        </div>
        <input
          type="range"
          min="0.5"
          max="6.0"
          step="0.5"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="range-slider"
        />
      </div>

      <div className="form-group">
        <div className="form-label">
          <span>Soil Moisture Condition (AMC)</span>
          <span className="font-mono" style={{ color: '#9ca3af' }}>
            {amc === 1 ? 'Dry (1)' : amc === 2 ? 'Moderate (2)' : 'Saturated (3)'}
          </span>
        </div>
        <select
          className="form-select"
          value={amc}
          onChange={(e) => setAmc(Number(e.target.value))}
        >
          <option value={1}>AMC-I (Dry Catchment / Low Runoff)</option>
          <option value={2}>AMC-II (Moderate Catchment)</option>
          <option value={3}>AMC-III (Saturated Soil / Max Runoff)</option>
        </select>
      </div>

      <button
        className="btn-primary"
        style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}
        onClick={handleSim}
        disabled={isSimulating}
      >
        <Zap size={14} />
        {isSimulating ? 'Running ML Inference...' : 'Execute ML Nowcast Simulation'}
      </button>
    </div>
  );
}
