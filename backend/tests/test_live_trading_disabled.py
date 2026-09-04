"""Safety invariant: this project must never create a live Alpaca broker."""

import pytest

from app.main import create_app
from app.core.config import Settings


def test_live_alpaca_mode_is_rejected():
    settings = Settings(
        broker_mode="alpaca",
        alpaca_paper=False,
        alpaca_api_key="test-key",
        alpaca_secret_key="test-secret",
    )

    with pytest.raises(ValueError, match="Live trading is disabled"):
        create_app(settings)
