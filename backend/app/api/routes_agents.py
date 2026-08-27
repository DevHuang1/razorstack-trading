"""Agent lifecycle status endpoint for UI synchronization."""
from fastapi import APIRouter, Depends

from app.api.deps import get_bus
from app.events.manager import EventBus
from app.schemas.agent import AgentStatusEvent, AgentStatusUpdate
from app.schemas.event import EventType

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("/status", response_model=AgentStatusEvent)
async def publish_agent_status(
    payload: AgentStatusUpdate,
    bus: EventBus = Depends(get_bus),
) -> AgentStatusEvent:
    await bus.publish(EventType.AGENT_STATUS.value, payload.model_dump(mode="json"))
    return AgentStatusEvent(agent=payload)
