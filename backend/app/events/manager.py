"""In-process event bus.

Every domain action (proposals, risk decisions, orders, fills) is published
here. Events are persisted to the `events` table and fanned out to in-memory
subscriber queues (WebSocket clients). The bus never raises on persistence
failure of subscribers; delivery is best-effort beyond the DB write.
"""
import asyncio
import logging
from collections import deque

from sqlalchemy import select

from app.db.base import utcnow
from app.models.event import EventModel
from app.schemas.event import TradeEvent

logger = logging.getLogger(__name__)


class EventBus:
    def __init__(self, session_factory, history_size: int = 500):
        self.session_factory = session_factory
        self._recent: deque[TradeEvent] = deque(maxlen=history_size)
        self._subscribers: set[asyncio.Queue] = set()

    # ------------------------------------------------------------------ write
    async def publish(self, event_type: str, payload: dict | None = None) -> TradeEvent:
        return (await self.publish_many([(event_type, payload)]))[0]

    async def publish_many(
        self, items: list[tuple[str, dict | None]]
    ) -> list[TradeEvent]:
        """Batch-publish events in a single DB transaction.

        Used when one action emits several events (e.g. a tick filling many
        orders) to avoid one commit round-trip per event.
        """
        if not items:
            return []
        events = [
            TradeEvent(event_type=et, payload=p or {}, timestamp=utcnow())
            for et, p in items
        ]
        self._recent.extend(events)
        async with self.session_factory() as session:
            session.add_all(
                [
                    EventModel(
                        id=e.event_id,
                        event_type=e.event_type,
                        payload=e.payload,
                        created_at=e.timestamp,
                    )
                    for e in events
                ]
            )
            await session.commit()
        for event in events:
            for queue in list(self._subscribers):
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    logger.warning(
                        "event subscriber queue full; dropping event",
                        extra={"event_id": event.event_id},
                    )
        return events

    # ------------------------------------------------------------------ reads
    def recent(self, limit: int = 50) -> list[TradeEvent]:
        items = list(self._recent)[-limit:]
        items.reverse()
        return items

    async def history(
        self, limit: int = 100, event_type: str | None = None
    ) -> list[TradeEvent]:
        query = select(EventModel).order_by(EventModel.created_at.desc()).limit(limit)
        if event_type:
            query = query.where(EventModel.event_type == event_type.upper())
        async with self.session_factory() as session:
            rows = (await session.execute(query)).scalars().all()
        return [
            TradeEvent(
                event_id=row.id,
                event_type=row.event_type,
                timestamp=row.created_at,
                payload=row.payload or {},
            )
            for row in rows
        ]

    # ------------------------------------------------------------- pub/sub
    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.discard(queue)

    def clear(self) -> None:
        """Drop the in-memory buffer (used by /admin/reset)."""
        self._recent.clear()
