"""Add road_name to projects; add road_segment_features table.

Revision ID: 0002_road_name_and_features
Revises: 0001_initial_schema
Create Date: 2026-11-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002_road_name_and_features"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "road_name" not in {column["name"] for column in inspector.get_columns("projects")}:
        op.add_column("projects", sa.Column("road_name", sa.String, nullable=True))
    if "idx_projects_road_name" not in {index["name"] for index in inspector.get_indexes("projects")}:
        op.create_index("idx_projects_road_name", "projects", ["road_name"])

    # road_segment_features is created in 0001 already via the initial migration.
    # This migration is a no-op for that table but kept for tracking road_name addition.


def downgrade() -> None:
    op.drop_index("idx_projects_road_name", table_name="projects")
    # Initial schema owns road_name; retain it when returning to revision 0001.
