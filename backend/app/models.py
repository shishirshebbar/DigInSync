import uuid
from datetime import date, datetime
from sqlalchemy import String, Float, Integer, Date, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry
from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class RoadSegment(Base):
    __tablename__ = "road_segments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    road_name: Mapped[str] = mapped_column(String, index=True)
    geometry: Mapped[object] = mapped_column(Geometry("LINESTRING", srid=4326))
    road_type: Mapped[str | None] = mapped_column(String)
    road_width: Mapped[float | None] = mapped_column(Float)
    ward: Mapped[str | None] = mapped_column(String)
    zone: Mapped[str | None] = mapped_column(String)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    organization: Mapped[str] = mapped_column(String)
    project_type: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text)
    road_segment_id: Mapped[str | None] = mapped_column(ForeignKey("road_segments.id"))
    geometry: Mapped[object | None] = mapped_column(Geometry("LINESTRING", srid=4326), nullable=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    duration_days: Mapped[int] = mapped_column(Integer)
    length_m: Mapped[float | None] = mapped_column(Float)
    lane_closure: Mapped[int] = mapped_column(Integer, default=0)
    impact_level: Mapped[str] = mapped_column(String, default="MEDIUM")
    priority: Mapped[str] = mapped_column(String, default="NORMAL")
    status: Mapped[str] = mapped_column(String, default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    road_segment: Mapped["RoadSegment | None"] = relationship("RoadSegment", lazy="selectin")
    risk_prediction: Mapped["RiskPrediction | None"] = relationship(
        "RiskPrediction", back_populates="project", uselist=False, lazy="selectin"
    )


class HistoricalWorkOrder(Base):
    __tablename__ = "historical_work_orders"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    source_id: Mapped[str | None] = mapped_column(String)
    organization: Mapped[str | None] = mapped_column(String)
    work_type: Mapped[str | None] = mapped_column(String)
    road_segment_id: Mapped[str | None] = mapped_column(String)
    geometry: Mapped[object | None] = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    date: Mapped[date | None] = mapped_column(Date)
    ward: Mapped[str | None] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text)


class RoadRepair(Base):
    __tablename__ = "road_repairs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    source_id: Mapped[str | None] = mapped_column(String)
    road_segment_id: Mapped[str | None] = mapped_column(String)
    geometry: Mapped[object | None] = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    repair_type: Mapped[str | None] = mapped_column(String)
    date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str | None] = mapped_column(String)


class Pothole(Base):
    __tablename__ = "potholes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    source_id: Mapped[str | None] = mapped_column(String)
    geometry: Mapped[object | None] = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    reported_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str | None] = mapped_column(String)


class Grievance(Base):
    __tablename__ = "grievances"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    source_id: Mapped[str | None] = mapped_column(String)
    geometry: Mapped[object | None] = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    category: Mapped[str | None] = mapped_column(String)
    date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str | None] = mapped_column(String)


class Conflict(Base):
    __tablename__ = "conflicts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    project_a_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    project_b_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    spatial_overlap: Mapped[bool] = mapped_column(default=False)
    temporal_overlap: Mapped[bool] = mapped_column(default=False)
    overlap_days: Mapped[int] = mapped_column(Integer, default=0)
    impact_score: Mapped[float] = mapped_column(Float, default=0.0)
    conflict_score: Mapped[float] = mapped_column(Float, default=0.0)
    severity: Mapped[str] = mapped_column(String, default="LOW")
    status: Mapped[str] = mapped_column(String, default="OPEN")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class RiskPrediction(Base):
    __tablename__ = "risk_predictions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), unique=True)
    risk_score: Mapped[float] = mapped_column(Float)
    risk_level: Mapped[str] = mapped_column(String)
    model_version: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="risk_prediction")


class CoordinationPlan(Base):
    __tablename__ = "coordination_plans"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    conflict_id: Mapped[str | None] = mapped_column(ForeignKey("conflicts.id"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    option_name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text)
    risk_score: Mapped[float] = mapped_column(Float)
    estimated_duration: Mapped[int] = mapped_column(Integer)
    tradeoffs: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Workplan(Base):
    __tablename__ = "workplans"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    coordination_plan_id: Mapped[str] = mapped_column(ForeignKey("coordination_plans.id"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    task: Mapped[str] = mapped_column(String)
    organization: Mapped[str] = mapped_column(String)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    dependency: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="PLANNED")
