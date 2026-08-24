"""Async SQLAlchemy engine/session factory helpers."""
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings

_IN_MEMORY_SQLITE = {"sqlite+aiosqlite://", "sqlite://", "sqlite+aiosqlite:///", "sqlite:///"}


def make_engine(settings: Settings):
    url = settings.database_url
    kwargs: dict = {"echo": False}
    if url.startswith("sqlite"):
        from sqlalchemy.pool import StaticPool

        kwargs["connect_args"] = {"check_same_thread": False}
        lowered = url.lower()
        if ":memory:" in lowered or url.rstrip("/") in _IN_MEMORY_SQLITE:
            # A single shared connection so every session sees the same DB.
            kwargs["poolclass"] = StaticPool
    else:
        kwargs["pool_pre_ping"] = True
    return create_async_engine(url, **kwargs)


def make_sessionmaker(engine) -> async_sessionmaker:
    return async_sessionmaker(engine, expire_on_commit=False)
