"""Shared FastAPI dependencies backed by app.state (no global singletons).

The backend runs two fully independent service stacks (dev + judge), each with
its own broker, engine, session factory, event bus and analytics. Requests pick
an account with the ``X-Account-Role`` header (``dev`` | ``judge``; default
``dev``). These dependencies return the component from the selected stack, so
route signatures stay unchanged while data never mixes across roles.
"""
from fastapi import Request

from app.events.manager import EventBus
from app.integrations.base import BrokerService
from app.services.order_manager import OrderManager
from app.services.portfolio import PortfolioService
from app.services.risk import RiskEngine
from app.services.trading import TradingService

DEFAULT_ROLE = "dev"


def get_role(request: Request) -> str:
    role = request.headers.get("X-Account-Role", DEFAULT_ROLE).strip().lower()
    return role if role in ("dev", "judge") else DEFAULT_ROLE


def _stack(request: Request) -> dict:
    return request.app.state.stacks[get_role(request)]


def get_settings(request: Request):
    return request.app.state.settings


def get_broker(request: Request) -> BrokerService:
    return _stack(request)["broker"]


def get_portfolio(request: Request) -> PortfolioService:
    return _stack(request)["portfolio"]


def get_risk(request: Request) -> RiskEngine:
    return _stack(request)["risk"]


def get_orders(request: Request) -> OrderManager:
    return _stack(request)["orders"]


def get_trading(request: Request) -> TradingService:
    return _stack(request)["trading"]


def get_bus(request: Request) -> EventBus:
    return _stack(request)["bus"]
