-- DigInSync full schema — run this directly in psql
-- Usage: docker exec -i ibmbobathon-db-1 psql -U digsync -d digsync < create_schema.sql

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- road_segments
CREATE TABLE IF NOT EXISTS road_segments (
    id VARCHAR PRIMARY KEY,
    road_name VARCHAR NOT NULL,
    osm_id VARCHAR,
    geometry geometry(LINESTRING, 4326) NOT NULL,
    road_type VARCHAR,
    road_width FLOAT,
    ward VARCHAR,
    zone VARCHAR,
    length_m FLOAT
);
CREATE INDEX IF NOT EXISTS idx_road_segments_geometry ON road_segments USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_road_segments_road_name ON road_segments (road_name);

-- projects
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR PRIMARY KEY,
    organization VARCHAR NOT NULL,
    project_type VARCHAR NOT NULL,
    description TEXT NOT NULL,
    road_name VARCHAR,
    road_segment_id VARCHAR REFERENCES road_segments(id),
    geometry geometry(LINESTRING, 4326),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    duration_days INTEGER NOT NULL,
    length_m FLOAT,
    lane_closure INTEGER NOT NULL DEFAULT 0,
    impact_level VARCHAR NOT NULL DEFAULT 'MEDIUM',
    priority VARCHAR NOT NULL DEFAULT 'NORMAL',
    status VARCHAR NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_geometry ON projects USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_projects_dates ON projects (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_projects_road_name ON projects (road_name);

-- historical_work_orders
CREATE TABLE IF NOT EXISTS historical_work_orders (
    id VARCHAR PRIMARY KEY,
    source_id VARCHAR,
    organization VARCHAR,
    work_type VARCHAR,
    road_segment_id VARCHAR,
    geometry geometry(POINT, 4326),
    date DATE,
    ward VARCHAR,
    description TEXT
);
CREATE INDEX IF NOT EXISTS idx_work_orders_geometry ON historical_work_orders USING GIST (geometry);

-- road_repairs
CREATE TABLE IF NOT EXISTS road_repairs (
    id VARCHAR PRIMARY KEY,
    source_id VARCHAR,
    road_segment_id VARCHAR,
    geometry geometry(POINT, 4326),
    repair_type VARCHAR,
    date DATE,
    status VARCHAR
);
CREATE INDEX IF NOT EXISTS idx_road_repairs_geometry ON road_repairs USING GIST (geometry);

-- potholes
CREATE TABLE IF NOT EXISTS potholes (
    id VARCHAR PRIMARY KEY,
    source_id VARCHAR,
    geometry geometry(POINT, 4326),
    reported_date DATE,
    status VARCHAR
);
CREATE INDEX IF NOT EXISTS idx_potholes_geometry ON potholes USING GIST (geometry);

-- grievances
CREATE TABLE IF NOT EXISTS grievances (
    id VARCHAR PRIMARY KEY,
    source_id VARCHAR,
    geometry geometry(POINT, 4326),
    category VARCHAR,
    date DATE,
    status VARCHAR
);
CREATE INDEX IF NOT EXISTS idx_grievances_geometry ON grievances USING GIST (geometry);

-- conflicts
CREATE TABLE IF NOT EXISTS conflicts (
    id VARCHAR PRIMARY KEY,
    project_a_id VARCHAR NOT NULL REFERENCES projects(id),
    project_b_id VARCHAR NOT NULL REFERENCES projects(id),
    spatial_overlap BOOLEAN NOT NULL DEFAULT FALSE,
    temporal_overlap BOOLEAN NOT NULL DEFAULT FALSE,
    overlap_days INTEGER NOT NULL DEFAULT 0,
    impact_score FLOAT NOT NULL DEFAULT 0,
    conflict_score FLOAT NOT NULL DEFAULT 0,
    severity VARCHAR NOT NULL DEFAULT 'LOW',
    status VARCHAR NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP DEFAULT NOW()
);

-- risk_predictions
CREATE TABLE IF NOT EXISTS risk_predictions (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL UNIQUE REFERENCES projects(id),
    risk_score FLOAT NOT NULL,
    risk_level VARCHAR NOT NULL,
    model_version VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- coordination_plans
CREATE TABLE IF NOT EXISTS coordination_plans (
    id VARCHAR PRIMARY KEY,
    conflict_id VARCHAR REFERENCES conflicts(id),
    project_id VARCHAR NOT NULL REFERENCES projects(id),
    option_name VARCHAR NOT NULL,
    description TEXT NOT NULL,
    risk_score FLOAT NOT NULL,
    estimated_duration INTEGER NOT NULL,
    tradeoffs TEXT NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW()
);

-- workplans
CREATE TABLE IF NOT EXISTS workplans (
    id VARCHAR PRIMARY KEY,
    coordination_plan_id VARCHAR NOT NULL REFERENCES coordination_plans(id),
    project_id VARCHAR NOT NULL REFERENCES projects(id),
    task VARCHAR NOT NULL,
    organization VARCHAR NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    dependency VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'PLANNED'
);

-- road_segment_features (ML feature cache)
CREATE TABLE IF NOT EXISTS road_segment_features (
    road_segment_id VARCHAR PRIMARY KEY REFERENCES road_segments(id),
    historical_work_orders INTEGER DEFAULT 0,
    historical_road_repairs INTEGER DEFAULT 0,
    pothole_count INTEGER DEFAULT 0,
    grievance_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Alembic version table (so alembic knows migrations are done)
CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);
DELETE FROM alembic_version;
INSERT INTO alembic_version VALUES ('0002_road_name_and_features');

SELECT 'Schema created successfully' AS result;
