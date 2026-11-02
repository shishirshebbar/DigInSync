from pydantic import BaseModel
from typing import Optional


class CoordinationOption(BaseModel):
    option_name: str
    description: str
    risk_score: float
    estimated_duration: int  # days
    tradeoffs: str
    schedule_impact: str


class CoordinateRequest(BaseModel):
    project_id: str
    conflict_ids: list[str] = []


class CoordinateResponse(BaseModel):
    project_id: str
    options: list[CoordinationOption]
    recommended_option: str
    explanation: str
    llm_used: bool  # False when LLM is unavailable (fallback mode)
