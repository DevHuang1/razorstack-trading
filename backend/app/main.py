"""FastAPI application factory.

Wires settings, database, broker and services into app.state (no globals),
installs a consistent JSON error envelope, creates tables on startup when
AUTO_CREATE_DB is enabled, and runs the mock-broker price tick loop.
"""
import asyncio
import contextlib
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import (
    routes_admin,
    routes_dashboard,
    routes_events,
    routes_health,
    routes_market,
    routes_orders,
    routes_portfolio,
    routes_risk,
    routes_trades,
)
from app.core.config import Settings
from app.core.errors import AppError
from app.core.logging import setup_logging
from app.db.base import Base
from app.db.session import make_engine, make_sessionmaker
from app.events.manager import EventBus
from app.integrations.base import BrokerError
from app.services.order_manager import OrderManager
from app.services.portfolio import PortfolioService
from app.services.risk import RiskEngine
from app.services.trading import TradingService

logger = logging.getLogger(__name__)


def _error(status_code: int, code: str, message: str, details=None) -> JSONResponse:
    payload = {"error": {"code": code, "message": message}}
    if details is not None:
        payload["error"]["details"] = details
    return JSONResponse(status_code=status_code, content=payload)


async def _tick_loop(app: FastAPI) -> None:
    """Mock-broker heartbeat: advance prices, fill crossed limits, emit events."""
    broker = app.state.broker
    interval = float(app.state.settings.mock_price_tick_seconds)
    while True:
        await asyncio.sleep(interval)
        try:
            filled_ids = await broker.tick()
            if filled_ids:
                await routes_admin.apply_tick_results(app, filled_ids)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("mock tick loop iteration failed")


async def _reconcile_loop(app: FastAPI) -> None:
    """Alpaca heartbeat: poll open orders and emit fills as they complete.

    The mock broker fills synchronously inside ``tick()``; the real Alpaca broker
    fills asynchronously, so without this loop local order state would never be
    reconciled (orders would stay SUBMITTED forever) and the event stream would
    miss ORDER_FILLED events.
    """
    orders = app.state.orders
    interval = float(app.state.settings.order_poll_seconds)
    while True:
        await asyncio.sleep(interval)
        try:
            filled = await orders.reconcile_open_orders()
            if filled:
                await routes_admin.publish_fills(app, filled)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("order reconciliation loop iteration failed")


async def _maintenance_loop(app: FastAPI) -> None:
    """Periodically prune old events / snapshots so tables don't grow unbounded."""
    interval = float(app.state.settings.maintenance_interval_seconds)
    while True:
        await asyncio.sleep(interval)
        try:
            await app.state.bus.prune(app.state.settings.event_retention_days)
            await app.state.portfolio.prune_snapshots(app.state.settings.snapshot_retention_days)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("maintenance loop iteration failed")


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    settings: Settings = app.state.settings
    if settings.auto_create_db:
        async with app.state.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("database schema ensured", extra={"auto_create_db": True})

    task = None
    if settings.broker_mode == "mock":
        task = asyncio.create_task(_tick_loop(app))
    else:
        task = asyncio.create_task(_reconcile_loop(app))
    maintenance = asyncio.create_task(_maintenance_loop(app))
    try:
        # Rehydrate the in-memory event buffer so /events/recent matches history.
        await app.state.bus.replay()
        yield
    finally:
        for t in (task, maintenance):
            t.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await t
        await app.state.engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    setup_logging(settings.log_level)

    engine = make_engine(settings)
    session_factory = make_sessionmaker(engine)

    if settings.broker_mode == "alpaca":
        from app.integrations.alpaca import AlpacaService

        broker = AlpacaService(
            api_key=settings.alpaca_api_key,
            secret_key=settings.alpaca_secret_key,
            paper=settings.alpaca_paper,
            client_id=settings.alpaca_client_id,
            client_secret=settings.alpaca_client_secret,
            base_url=settings.alpaca_base_url,
            token_url=settings.alpaca_token_url,
            oauth_token=settings.alpaca_oauth_token,
            oauth_scope=settings.alpaca_oauth_scope,
        )
    else:
        from app.integrations.mock_alpaca import MockAlpacaService

        broker = MockAlpacaService(
            initial_cash=settings.mock_initial_cash,
            persist_path=settings.mock_state_path or None,
        )

    portfolio = PortfolioService(broker, session_factory, settings)
    risk = RiskEngine(portfolio, broker, settings)
    orders = OrderManager(broker, session_factory)
    bus = EventBus(session_factory)
    trading = TradingService(session_factory, portfolio, risk, orders, bus)

    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        lifespan=lifespan,
        debug=settings.debug,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.broker = broker
    app.state.portfolio = portfolio
    app.state.risk = risk
    app.state.orders = orders
    app.state.bus = bus
    app.state.trading = trading

    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins if origins != ["*"] else ["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # ---- error envelope ---------------------------------------------------
    @app.exception_handler(AppError)
    async def handle_app_error(_request: Request, exc: AppError):
        return _error(exc.status_code, exc.code, exc.message)

    @app.exception_handler(BrokerError)
    async def handle_broker_error(_request: Request, exc: BrokerError):
        logger.error("broker failure", extra={"detail": str(exc)})
        return _error(502, "BROKER_ERROR", str(exc))

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_request: Request, exc: RequestValidationError):
        details = [
            {
                "type": err.get("type"),
                "loc": list(err.get("loc", [])),
                "msg": err.get("msg"),
                "input": str(err.get("input")),
            }
            for err in exc.errors()
        ]
        return _error(422, "VALIDATION_ERROR", "request validation failed", details=details)

    @app.exception_handler(Exception)
    async def handle_unexpected(_request: Request, exc: Exception):
        logger.exception("unhandled server error")
        return _error(500, "INTERNAL_ERROR", "unexpected server error")

    for router in (
        routes_dashboard.router,
        routes_health.router,
        routes_trades.router,
        routes_orders.router,
        routes_portfolio.router,
        routes_market.router,
        routes_risk.router,
        routes_events.router,
        routes_admin.router,
    ):
        app.include_router(router)

    return app


app = create_app()
