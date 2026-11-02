"""
LLM provider abstraction — keeps the provider swappable.
Currently supports: gemini
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from app.schemas.project import ProjectExtract
import structlog

logger = structlog.get_logger()


class LLMProvider(ABC):
    @abstractmethod
    async def extract_project(self, description: str) -> ProjectExtract:
        """Agent 1 — parse natural-language description into structured project."""
        ...

    @abstractmethod
    async def generate(self, prompt: str, tools: list | None = None) -> str:
        """Generic generation call used by Coordination + Workplan agents."""
        ...


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-1.5-flash"):
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self._model = genai.GenerativeModel(model)
        self._model_name = model

    async def extract_project(self, description: str) -> ProjectExtract:
        import json, asyncio
        from datetime import date

        prompt = f"""
You are an infrastructure project parser. Extract structured information from the description below.
Return ONLY valid JSON matching this schema (no markdown, no explanation):
{{
  "project_type": "<water_pipeline|telecom|electricity|road_repair|drainage|utility>",
  "road_name": "<road name>",
  "start_date": "<YYYY-MM-DD>",
  "end_date": "<YYYY-MM-DD>",
  "length_m": <number or null>,
  "lane_closure": <0 or 1>,
  "organization": "<org name or null>",
  "description": "<original description>"
}}

Description: {description}
""".strip()

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, self._model.generate_content, prompt)
        raw = response.text.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        return ProjectExtract(**data)

    async def generate(self, prompt: str, tools: list | None = None) -> str:
        import asyncio
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, self._model.generate_content, prompt)
        return response.text


def get_llm_provider() -> LLMProvider:
    from app.config import get_settings
    settings = get_settings()

    if settings.llm_provider == "gemini":
        return GeminiProvider(
            api_key=settings.llm_api_key,
            model=settings.gemini_model,
        )
    raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")
