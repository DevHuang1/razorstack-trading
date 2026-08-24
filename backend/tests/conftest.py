"""Shared fixtures: every test gets a fresh app with in-memory SQLite and a
deterministic MockAlpacaService. Service-level tests bypass HTTP entirely."""
import os
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

# Hermetic tests: force mock broker BEFORE app.main import triggers
# create_app() at module level (env vars take priority over .env values).
os.environ["BROKER_MODE"] = "mock"

from app.core.config import Settings
from app.db.base import Base
from app.db.session import make_engine, make_sessionmaker
from app.integrations.mock_alpaca import MockAlpacaService
from app.main import create_app
from app.services.portfolio import PortfolioService
from app.services.risk import RiskEngine


def make_settings(**overrides) -> Settings:
    defaults = dict(
        environment="test",
        log_level="WARNING",
        database_url="sqlite+aiosqlite:///:memory:",
        broker_mode="mock",
        # Pin every broker credential so .env secrets never leak into tests.
        alpaca_api_key="",
        alpaca_secret_key="",
        alpaca_paper=True,
        alpaca_client_id="",
        alpaca_client_secret="",
        alpaca_base_url="",
        alpaca_token_url="",
        alpaca_oauth_token="",
        mock_initial_cash=100_000.0,
        # Effectively disables the background tick loop during tests.
        mock_price_tick_seconds=3600.0,
        # Never persist mock-broker state during tests.
        mock_state_path="",
    )
    return Settings(**{**defaults, **overrides})


@pytest.fixture
def settings():
    return make_settings()


@pytest.fixture
def app(settings):
    return create_app(settings)


@pytest.fixture
def client(app):
    # The context manager runs the lifespan (creates tables, starts tasks).
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
async def services():
    settings = make_settings()
    engine = make_engine(settings)
    session_factory = make_sessionmaker(engine)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    broker = MockAlpacaService(initial_cash=settings.mock_initial_cash)
    portfolio = PortfolioService(broker, session_factory, settings)
    risk = RiskEngine(portfolio, broker, settings)
    try:
        yield SimpleNamespace(
            settings=settings,
            engine=engine,
            db=session_factory,
            broker=broker,
            portfolio=portfolio,
            risk=risk,
        )
    finally:
        await engine.dispose()
