"""Async SQLAlchemy engine/session factory helpers."""
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings

_IN_MEMORY_SQLITE = {"sqlite+aiosqlite://", "sqlite://", "sqlite+aiosqlite:///", "sqlite:///"}


def _normalize_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        return "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


def make_engine(settings: Settings):
    return _make_engine(settings.database_url)


def make_engine_for_url(url: str):
    return _make_engine(url)


def _make_engine(url: str):
    url = _normalize_url(url)
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
