"""
Database Service for Urban Flood Nowcasting System
SQLite-backed persistent store for:
1. Live rainfall telemetry feed (Open-Meteo, IoT rain gauges, manual triggers).
2. Historical nowcast cycles, flood metrics, and system statuses.
3. Municipal emergency advisories and pump deployment alerts.
"""

import os
import json
import sqlite3
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional

logger = logging.getLogger("DBService")


class FloodNowcastDB:
    """Manages SQLite database operations for live rainfall and nowcast logging."""

    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            base_dir = Path(__file__).resolve().parent.parent
            self.db_path = base_dir / "data" / "flood_nowcast.db"
        else:
            self.db_path = Path(db_path)

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self):
        """Create tables if they do not exist."""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # 1. Rainfall Readings Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS rainfall_readings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    source TEXT NOT NULL,
                    rain_rate_mm_hr REAL NOT NULL,
                    rain_accumulated_1h_mm REAL NOT NULL,
                    weather_code INTEGER DEFAULT 0,
                    weather_desc TEXT DEFAULT 'Normal',
                    station_name TEXT DEFAULT 'Jankipuram, Lucknow',
                    raw_payload TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_rain_timestamp ON rainfall_readings (timestamp DESC)")

            # 2. Nowcast Runs Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS nowcast_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    rain_intensity_mm_hr REAL NOT NULL,
                    duration_hrs REAL NOT NULL,
                    amc_level INTEGER NOT NULL,
                    system_status TEXT NOT NULL,
                    max_flood_depth_m REAL NOT NULL,
                    closed_road_segments INTEGER NOT NULL,
                    total_latency_ms REAL NOT NULL,
                    high_risk_hotspots TEXT,
                    is_auto_ingested INTEGER DEFAULT 0
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_nowcast_timestamp ON nowcast_runs (timestamp DESC)")

            # 3. Municipal Alerts Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS municipal_alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nowcast_run_id INTEGER,
                    timestamp TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    headline TEXT NOT NULL,
                    description TEXT NOT NULL,
                    affected_nodes TEXT,
                    acknowledged INTEGER DEFAULT 0,
                    FOREIGN KEY(nowcast_run_id) REFERENCES nowcast_runs(id)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_alert_timestamp ON municipal_alerts (timestamp DESC)")

            conn.commit()
            logger.info(f"Database initialized at {self.db_path}")

    def insert_rainfall_reading(
        self,
        source: str,
        rain_rate_mm_hr: float,
        rain_accumulated_1h_mm: float = 0.0,
        weather_code: int = 0,
        weather_desc: str = "Normal",
        station_name: str = "Jankipuram, Lucknow",
        raw_payload: Optional[Dict[str, Any]] = None,
        timestamp: Optional[str] = None,
    ) -> int:
        """Insert a new rainfall observation into the database."""
        if timestamp is None:
            timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        raw_str = json.dumps(raw_payload) if raw_payload else "{}"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO rainfall_readings (
                    timestamp, source, rain_rate_mm_hr, rain_accumulated_1h_mm,
                    weather_code, weather_desc, station_name, raw_payload
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    timestamp,
                    source,
                    float(rain_rate_mm_hr),
                    float(rain_accumulated_1h_mm),
                    weather_code,
                    weather_desc,
                    station_name,
                    raw_str,
                ),
            )
            conn.commit()
            return cursor.lastrowid

    def get_latest_rainfall(self) -> Optional[Dict[str, Any]]:
        """Return the most recent rainfall reading."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM rainfall_readings ORDER BY id DESC LIMIT 1")
            row = cursor.fetchone()
            if row:
                return dict(row)
        return None

    def get_recent_readings(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return the last N rainfall readings ordered chronologically (oldest to newest)."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM rainfall_readings ORDER BY id DESC LIMIT ?",
                (limit,),
            )
            rows = cursor.fetchall()
            # Reverse so it flows chronologically
            return [dict(r) for r in reversed(rows)]

    def insert_nowcast_run(
        self,
        rain_intensity_mm_hr: float,
        duration_hrs: float,
        amc_level: int,
        system_status: str,
        max_flood_depth_m: float,
        closed_road_segments: int,
        total_latency_ms: float,
        high_risk_hotspots: Optional[List[Dict[str, Any]]] = None,
        is_auto_ingested: bool = False,
        timestamp: Optional[str] = None,
    ) -> int:
        """Insert a nowcast execution record."""
        if timestamp is None:
            timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        hotspots_json = json.dumps(high_risk_hotspots or [])

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO nowcast_runs (
                    timestamp, rain_intensity_mm_hr, duration_hrs, amc_level,
                    system_status, max_flood_depth_m, closed_road_segments,
                    total_latency_ms, high_risk_hotspots, is_auto_ingested
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    timestamp,
                    float(rain_intensity_mm_hr),
                    float(duration_hrs),
                    int(amc_level),
                    system_status,
                    float(max_flood_depth_m),
                    int(closed_road_segments),
                    float(total_latency_ms),
                    hotspots_json,
                    1 if is_auto_ingested else 0,
                ),
            )
            conn.commit()
            return cursor.lastrowid

    def insert_alerts(self, nowcast_run_id: int, alerts: List[Dict[str, Any]]):
        """Insert municipal alert bulletins linked to a nowcast run."""
        if not alerts:
            return

        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with self._get_connection() as conn:
            cursor = conn.cursor()
            for alert in alerts:
                cursor.execute(
                    """
                    INSERT INTO municipal_alerts (
                        nowcast_run_id, timestamp, severity, headline,
                        description, affected_nodes
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        nowcast_run_id,
                        timestamp,
                        alert.get("severity", "ADVISORY"),
                        alert.get("headline", ""),
                        alert.get("description", ""),
                        json.dumps(alert.get("affected_nodes", [])),
                    ),
                )
            conn.commit()

    def get_recent_alerts(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Return recent municipal alerts."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM municipal_alerts ORDER BY id DESC LIMIT ?",
                (limit,),
            )
            return [dict(r) for r in cursor.fetchall()]

    def get_system_stats(self) -> Dict[str, Any]:
        """Aggregate database statistics."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM rainfall_readings")
            total_readings = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM nowcast_runs")
            total_nowcasts = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM municipal_alerts")
            total_alerts = cursor.fetchone()[0]

            return {
                "total_rainfall_readings": total_readings,
                "total_nowcast_runs": total_nowcasts,
                "total_alerts_logged": total_alerts,
                "database_size_bytes": self.db_path.stat().st_size if self.db_path.exists() else 0,
            }
