"""Persistent proposals, demo decisions, workplan headers and audit history."""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004_approval_workplans"
down_revision = "0003_grievance_ward"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("coordination_plans", "risk_score", nullable=True)
    op.alter_column("coordination_plans", "estimated_duration", nullable=True)
    for column in [
        sa.Column("option_key", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("project_snapshots", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("analysis_snapshot", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("draft_tasks", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("decision_reason", sa.Text(), nullable=True),
        sa.Column("decided_by", sa.String(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
    ]:
        op.add_column("coordination_plans", column)
    # Historical suggestions have no reviewed snapshot; keep them read-only.
    op.execute("UPDATE coordination_plans SET status='LEGACY' WHERE status='PENDING'")
    op.create_table(
        "workplan_headers",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("coordination_plan_id", sa.String(), sa.ForeignKey("coordination_plans.id"), nullable=False, unique=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("approved_by", sa.String(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("proposal_revision", sa.Integer(), nullable=False),
        sa.Column("warnings", JSONB(), nullable=False),
    )
    op.add_column("workplans", sa.Column("workplan_id", sa.String(), nullable=True))
    op.add_column("workplans", sa.Column("position", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("workplans", sa.Column("notes", sa.Text(), nullable=False, server_default=""))
    op.create_foreign_key("fk_workplans_header", "workplans", "workplan_headers", ["workplan_id"], ["id"])
    connection = op.get_bind()
    legacy = connection.execute(sa.text("SELECT DISTINCT coordination_plan_id FROM workplans")).scalars().all()
    for plan_id in legacy:
        header_id = str(uuid.uuid4())
        connection.execute(sa.text("""
            INSERT INTO workplan_headers
                (id, coordination_plan_id, project_id, proposal_revision, warnings)
            SELECT :id, id, project_id, revision,
                   '["Imported legacy workplan; approval identity and reviewed snapshot were not recorded."]'::jsonb
            FROM coordination_plans WHERE id=:plan_id
        """), {"id": header_id, "plan_id": plan_id})
        connection.execute(sa.text("UPDATE workplans SET workplan_id=:id WHERE coordination_plan_id=:plan_id"),
                           {"id": header_id, "plan_id": plan_id})
    op.alter_column("workplans", "workplan_id", nullable=False)
    op.create_index("ix_workplans_workplan_id", "workplans", ["workplan_id"])
    op.create_table(
        "plan_audit_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("coordination_plan_id", sa.String(), sa.ForeignKey("coordination_plans.id"), nullable=False),
        sa.Column("event", sa.String(), nullable=False),
        sa.Column("actor", sa.String(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("details", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_plan_audit_events_coordination_plan_id", "plan_audit_events", ["coordination_plan_id"])


def downgrade() -> None:
    # Downgrading would discard decisions and task grouping; require an explicit backup/restore instead.
    raise RuntimeError("Phase 8 downgrade is intentionally unsupported; restore a verified backup.")
