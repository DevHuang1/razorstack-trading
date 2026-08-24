"""Application error types mapped to consistent API error envelopes."""
from app.integrations.base import (
    BrokerConnectionError,
    BrokerError,
    InsufficientFundsError,
    InvalidOrderError,
    OrderNotFoundError,
)

__all__ = [
    "AppError",
    "NotFoundError",
    "ConflictError",
    "BrokerError",
    "BrokerConnectionError",
    "InsufficientFundsError",
    "InvalidOrderError",
    "OrderNotFoundError",
]


class AppError(Exception):
    status_code = 400
    code = "BAD_REQUEST"

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"
