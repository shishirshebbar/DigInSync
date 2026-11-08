from pydantic import BaseModel, Field


class CoordinationOption(BaseModel):
    option_key: str
    option_name: str
    description: str
    risk_score: float | None = None
    estimated_duration: int | None = None
    tradeoffs: str
    schedule_impact: str


class CoordinateRequest(BaseModel):
    project_id: str = Field(min_length=1, max_length=100)
    conflict_ids: list[str] = Field(default_factory=list, max_length=0)
    use_ai: bool = False


class CoordinateResponse(BaseModel):
    project_id: str
    options: list[CoordinationOption]
    recommended_option: str
    explanation: str
    llm_used: bool
    baseline_risk_score: float
    warnings: list[str]
