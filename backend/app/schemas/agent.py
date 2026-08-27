"""Agent lifecycle contracts shared with the frontend mascot layer."""
from typing import Literal

from pydantic import BaseModel, Field, field_validator

AgentRole = Literal["news", "market", "bull", "bear", "cio"]
AgentStatus = Literal["idle", "thinking", "speaking", "success", "error"]


class AgentStatusUpdate(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=120)
    role: AgentRole
    status: AgentStatus
    run_id: str | None = Field(default=None, max_length=120)
    headline: str | None = Field(default=None, max_length=500)
    detail: str | None = Field(default=None, max_length=4000)
    progress: int | None = Field(default=None, ge=0, le=100)
    metadata: dict[str, str | int | float | bool | None] = Field(default_factory=dict)

    @field_validator("agent_id", "run_id")
    @classmethod
    def strip_identifiers(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class AgentStatusEvent(BaseModel):
    event_type: Literal["AGENT_STATUS"] = "AGENT_STATUS"
    agent: AgentStatusUpdate
