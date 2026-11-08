"""Initial schema — all tables with PostGIS spatial indexes.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable PostGIS (idempotent)
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis_topology")

    op.create_table(
        "road_segments",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("road_name", sa.String, nullable=False),
        sa.Column("osm_id", sa.String, nullable=True),
        sa.Column("geometry", Geometry("LINESTRING", srid=4326, spatial_index=False), nullable=False),
        sa.Column("road_type", sa.String, nullable=True),
        sa.Column("road_width", sa.Float, nullable=True),
        sa.Column("ward", sa.String, nullable=True),
        sa.Column("zone", sa.String, nullable=True),
        sa.Column("length_m", sa.Float, nullable=True),
    )
    op.create_index("idx_road_segments_geometry", "road_segments",
                    ["geometry"], postgresql_using="gist")
    op.create_index("idx_road_segments_road_name", "road_segments", ["road_name"])

    op.create_table(
        "projects",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("organization", sa.String, nullable=False),
        sa.Column("project_type", sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("road_name", sa.String, nullable=True),
        sa.Column("road_segment_id", sa.String, sa.ForeignKey("road_segments.id"), nullable=True),
        sa.Column("geometry", Geometry("LINESTRING", srid=4326, spatial_index=False), nullable=True),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("duration_days", sa.Integer, nullable=False),
        sa.Column("length_m", sa.Float, nullable=True),
        sa.Column("lane_closure", sa.Integer, nullable=False, server_default="0"),
        sa.Column("impact_level", sa.String, nullable=False, server_default="MEDIUM"),
        sa.Column("priority", sa.String, nullable=False, server_default="NORMAL"),
        sa.Column("status", sa.String, nullable=False, server_default="PENDING"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("idx_projects_geometry", "projects",
                    ["geometry"], postgresql_using="gist")
    op.create_index("idx_projects_dates", "projects", ["start_date", "end_date"])

    op.create_table(
        "historical_work_orders",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("source_id", sa.String, nullable=True),
        sa.Column("organization", sa.String, nullable=True),
        sa.Column("work_type", sa.String, nullable=True),
        sa.Column("road_segment_id", sa.String, nullable=True),
        sa.Column("geometry", Geometry("POINT", srid=4326, spatial_index=False), nullable=True),
        sa.Column("date", sa.Date, nullable=True),
        sa.Column("ward", sa.String, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
    )
    op.create_index("idx_work_orders_geometry", "historical_work_orders",
                    ["geometry"], postgresql_using="gist")

    op.create_table(
        "road_repairs",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("source_id", sa.String, nullable=True),
        sa.Column("road_segment_id", sa.String, nullable=True),
        sa.Column("geometry", Geometry("POINT", srid=4326, spatial_index=False), nullable=True),
        sa.Column("repair_type", sa.String, nullable=True),
        sa.Column("date", sa.Date, nullable=True),
        sa.Column("status", sa.String, nullable=True),
    )
    op.create_index("idx_road_repairs_geometry", "road_repairs",
                    ["geometry"], postgresql_using="gist")

    op.create_table(
        "potholes",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("source_id", sa.String, nullable=True),
        sa.Column("geometry", Geometry("POINT", srid=4326, spatial_index=False), nullable=True),
        sa.Column("reported_date", sa.Date, nullable=True),
        sa.Column("status", sa.String, nullable=True),
    )
    op.create_index("idx_potholes_geometry", "potholes",
                    ["geometry"], postgresql_using="gist")

    op.create_table(
        "grievances",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("source_id", sa.String, nullable=True),
        sa.Column("geometry", Geometry("POINT", srid=4326, spatial_index=False), nullable=True),
        sa.Column("category", sa.String, nullable=True),
        sa.Column("date", sa.Date, nullable=True),
        sa.Column("status", sa.String, nullable=True),
    )
    op.create_index("idx_grievances_geometry", "grievances",
                    ["geometry"], postgresql_using="gist")

    op.create_table(
        "conflicts",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("project_a_id", sa.String, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("project_b_id", sa.String, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("spatial_overlap", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("temporal_overlap", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("overlap_days", sa.Integer, nullable=False, server_default="0"),
        sa.Column("impact_score", sa.Float, nullable=False, server_default="0"),
        sa.Column("conflict_score", sa.Float, nullable=False, server_default="0"),
        sa.Column("severity", sa.String, nullable=False, server_default="LOW"),
        sa.Column("status", sa.String, nullable=False, server_default="OPEN"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "risk_predictions",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("project_id", sa.String, sa.ForeignKey("projects.id"), nullable=False, unique=True),
        sa.Column("risk_score", sa.Float, nullable=False),
        sa.Column("risk_level", sa.String, nullable=False),
        sa.Column("model_version", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "coordination_plans",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("conflict_id", sa.String, sa.ForeignKey("conflicts.id"), nullable=True),
        sa.Column("project_id", sa.String, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("option_name", sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("risk_score", sa.Float, nullable=False),
        sa.Column("estimated_duration", sa.Integer, nullable=False),
        sa.Column("tradeoffs", sa.Text, nullable=False),
        sa.Column("status", sa.String, nullable=False, server_default="PENDING"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "workplans",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("coordination_plan_id", sa.String, sa.ForeignKey("coordination_plans.id"), nullable=False),
        sa.Column("project_id", sa.String, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("task", sa.String, nullable=False),
        sa.Column("organization", sa.String, nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("dependency", sa.String, nullable=True),
        sa.Column("status", sa.String, nullable=False, server_default="PLANNED"),
    )

    # road_segment_features — pre-computed ML feature cache per segment
    op.create_table(
        "road_segment_features",
        sa.Column("road_segment_id", sa.String, sa.ForeignKey("road_segments.id"), primary_key=True),
        sa.Column("historical_work_orders", sa.Integer, server_default="0"),
        sa.Column("historical_road_repairs", sa.Integer, server_default="0"),
        sa.Column("pothole_count", sa.Integer, server_default="0"),
        sa.Column("grievance_count", sa.Integer, server_default="0"),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("road_segment_features")
    op.drop_table("workplans")
    op.drop_table("coordination_plans")
    op.drop_table("risk_predictions")
    op.drop_table("conflicts")
    op.drop_table("grievances")
    op.drop_table("potholes")
    op.drop_table("road_repairs")
    op.drop_table("historical_work_orders")
    op.drop_table("projects")
    op.drop_table("road_segments")
