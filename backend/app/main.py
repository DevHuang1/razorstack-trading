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
    routes_agents,
    routes_dashboard,
    routes_events,
    routes_health,
    routes_market,
    routes_orders,
    routes_portfolio,
    routes_quant,
    routes_risk,
    routes_trades,
)
from app.core.config import Settings
from app.core.errors import AppError
from app.core.logging import setup_logging
from app.db.base import Base
from app.db.session import make_engine_for_url, make_sessionmaker
from app.events.manager import EventBus
from app.integrations.base import BrokerError, BrokerService
from app.integrations.mock_alpaca import MockAlpacaService
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
    settings = app.state.settings
    interval = float(settings.mock_price_tick_seconds)
    while True:
        await asyncio.sleep(interval)
        try:
            for stack in app.state.stacks.values():
                broker = stack["broker"]
                if not isinstance(broker, MockAlpacaService):
                    continue
                filled_ids = await broker.tick()
                if filled_ids:
                    await routes_admin.apply_tick_results_app(app, filled_ids)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("mock tick loop iteration failed")


async def _reconcile_loop(app: FastAPI) -> None:
    """Alpaca heartbeat: poll open orders and emit fills as they complete.

    The mock broker fills synchronously inside ``tick()``; the real Alpaca broker
    fills asynchronously, so without this loop local order state would never be
    reconciled (orders would stay SUBMITTED forever) and the event stream would
    miss ORDER_FILLED events. Each role's stack reconciles its own orders.
    """
    settings = app.state.settings
    interval = float(settings.order_poll_seconds)
    while True:
        await asyncio.sleep(interval)
        try:
            for stack in app.state.stacks.values():
                orders = stack["orders"]
                filled = await orders.reconcile_open_orders()
                if filled:
                    await routes_admin.publish_fills_app(app, filled)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("order reconciliation loop iteration failed")


async def _maintenance_loop(app: FastAPI) -> None:
    """Periodically prune old events / snapshots so tables don't grow unbounded."""
    settings = app.state.settings
    interval = float(settings.maintenance_interval_seconds)
    while True:
        await asyncio.sleep(interval)
        try:
            for stack in app.state.stacks.values():
                await stack["bus"].prune(settings.event_retention_days)
                await stack["portfolio"].prune_snapshots(settings.snapshot_retention_days)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("maintenance loop iteration failed")


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    settings: Settings = app.state.settings
    if settings.auto_create_db:
        for stack in app.state.stacks.values():
            async with stack["engine"].begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        logger.info("database schema ensured", extra={"auto_create_db": True})

    tasks: list[asyncio.Task] = []
    if settings.broker_mode == "mock":
        tasks.append(asyncio.create_task(_tick_loop(app)))
    else:
        tasks.append(asyncio.create_task(_reconcile_loop(app)))
    tasks.append(asyncio.create_task(_maintenance_loop(app)))
    try:
        # Rehydrate the in-memory event buffer so /events/recent matches history.
        for stack in app.state.stacks.values():
            await stack["bus"].replay()
        yield
    finally:
        for t in tasks:
            t.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await t
        for stack in app.state.stacks.values():
            await stack["engine"].dispose()


def _build_stack(
    *,
    settings: Settings,
    role: str,
    api_key: str,
    secret_key: str,
    database_url: str,
) -> dict:
    """Construct one fully-isolated role stack (broker + analytics + bus)."""
    engine = make_engine_for_url(database_url)
    session_factory = make_sessionmaker(engine)

    if settings.broker_mode == "alpaca":
        from app.integrations.alpaca import AlpacaService

        broker: BrokerService = AlpacaService(
            api_key=api_key,
            secret_key=secret_key,
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

        persist_path: str | None = None
        if settings.mock_state_path:
            stem, sep, ext = settings.mock_state_path.rpartition(".")
            persist_path = f"{stem}.{role}{sep}{ext}" if sep else f"{settings.mock_state_path}.{role}"
        broker: BrokerService = MockAlpacaService(
            initial_cash=settings.mock_initial_cash,
            persist_path=persist_path,
        )

    portfolio = PortfolioService(broker, session_factory, settings)
    risk = RiskEngine(portfolio, broker, settings)
    orders = OrderManager(broker, session_factory)
    bus = EventBus(session_factory)
    trading = TradingService(session_factory, portfolio, risk, orders, bus)

    return {
        "engine": engine,
        "session_factory": session_factory,
        "broker": broker,
        "portfolio": portfolio,
        "risk": risk,
        "orders": orders,
        "bus": bus,
        "trading": trading,
    }


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    setup_logging(settings.log_level)

    if settings.broker_mode == "alpaca" and not settings.alpaca_paper:
        raise ValueError("Live trading is disabled; ALPACA_PAPER must remain true")

    # Two independent stacks: dev (default account, its own DB) and judge
    # (second paper account, its own DB when judge_database_url is set).
    judge_url = settings.judge_database_url or settings.database_url
    stacks = {
        "dev": _build_stack(
            settings=settings,
            role="dev",
            api_key=settings.alpaca_api_key,
            secret_key=settings.alpaca_secret_key,
            database_url=settings.database_url,
        ),
        "judge": _build_stack(
            settings=settings,
            role="judge",
            api_key=settings.alpaca_judge_api_key or settings.alpaca_api_key,
            secret_key=settings.alpaca_judge_secret_key or settings.alpaca_secret_key,
            database_url=judge_url,
        ),
    }

    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        lifespan=lifespan,
        debug=settings.debug,
    )
    app.state.settings = settings
    app.state.stacks = stacks
    # Convenience aliases to the dev stack (keeps legacy references working).
    app.state.engine = stacks["dev"]["engine"]
    app.state.session_factory = stacks["dev"]["session_factory"]
    app.state.broker = stacks["dev"]["broker"]
    app.state.portfolio = stacks["dev"]["portfolio"]
    app.state.risk = stacks["dev"]["risk"]
    app.state.orders = stacks["dev"]["orders"]
    app.state.bus = stacks["dev"]["bus"]
    app.state.trading = stacks["dev"]["trading"]

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
        routes_agents.router,
        routes_health.router,
        routes_trades.router,
        routes_orders.router,
        routes_market.router,
        routes_portfolio.router,
        routes_quant.router,
        routes_risk.router,
        routes_events.router,
        routes_admin.router,
    ):
        app.include_router(router)

    return app


app = create_app()
