"""Preserve the ward supplied by the BBMP grievance dataset."""
from alembic import op
import sqlalchemy as sa

revision = "0003_grievance_ward"
down_revision = "0002_road_name_and_features"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("grievances", sa.Column("ward", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("grievances", "ward")
