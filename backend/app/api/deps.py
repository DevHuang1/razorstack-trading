"""Shared FastAPI dependencies backed by app.state (no global singletons)."""
from fastapi import Request

from app.events.manager import EventBus
from app.integrations.base import BrokerService
from app.services.order_manager import OrderManager
from app.services.portfolio import PortfolioService
from app.services.risk import RiskEngine
from app.services.trading import TradingService


def get_settings(request: Request):
    return request.app.state.settings


def get_broker(request: Request) -> BrokerService:
    return request.app.state.broker


def get_portfolio(request: Request) -> PortfolioService:
    return request.app.state.portfolio


def get_risk(request: Request) -> RiskEngine:
    return request.app.state.risk


def get_orders(request: Request) -> OrderManager:
    return request.app.state.orders


def get_trading(request: Request) -> TradingService:
    return request.app.state.trading


def get_bus(request: Request) -> EventBus:
    return request.app.state.bus
