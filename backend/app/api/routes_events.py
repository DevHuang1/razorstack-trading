"""Event endpoints: history, recent buffer, live WebSocket stream."""
import asyncio

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from app.api.deps import get_bus
from app.events.manager import EventBus
from app.schemas.event import TradeEvent

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[TradeEvent])
async def event_history(
    limit: int = Query(default=100, ge=1, le=1000),
    type: str | None = Query(default=None),
    bus: EventBus = Depends(get_bus),
):
    return await bus.history(limit=limit, event_type=type)


@router.get("/recent", response_model=list[TradeEvent])
async def recent_events(
    limit: int = Query(default=50, ge=1, le=500),
    bus: EventBus = Depends(get_bus),
):
    return bus.recent(limit=limit)


@router.websocket("/ws")
async def events_ws(websocket: WebSocket):
    """Stream every published event as JSON; one line per event.

    A periodic heartbeat detects clients that vanished without sending a close
    frame: the ``send_text`` fails, the loop exits, and the subscriber queue is
    removed from the bus (otherwise it would leak and never receive events).
    """
    await websocket.accept()
    bus: EventBus = websocket.app.state.bus
    queue = bus.subscribe()
    HEARTBEAT_SECONDS = 30.0
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SECONDS)
            except asyncio.TimeoutError:
                # Client tolerates a non-JSON "ping" (its JSON.parse is guarded).
                await websocket.send_text("ping")
                continue
            await websocket.send_json(event.model_dump(mode="json"))
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        raise
    finally:
        bus.unsubscribe(queue)
