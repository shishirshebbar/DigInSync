from typing import Literal
from pydantic import BaseModel
from app.schemas.project import ProjectRead


class LineGeometry(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[list[float]]


class MapFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    geometry: LineGeometry | None
    properties: dict


class MapCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[MapFeature]
    total: int
    limit: int
    offset: int


class ProjectMap(MapCollection):
    unmapped_ids: list[str]
    location_basis: str
    warnings: list[str]


class ProjectCatalog(BaseModel):
    items: list[ProjectRead]
    total: int
    limit: int
    offset: int
