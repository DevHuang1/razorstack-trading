"""Application configuration loaded from environment variables / .env."""
import json
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_SECTOR_MAP: dict[str, str] = {
    "NVDA": "technology",
    "AAPL": "technology",
    "MSFT": "technology",
    "AMD": "technology",
    "GOOGL": "technology",
    "META": "technology",
    "JPM": "financials",
    "BAC": "financials",
    "GS": "financials",
    "JNJ": "healthcare",
    "PFE": "healthcare",
    "UNH": "healthcare",
    "XOM": "energy",
    "CVX": "energy",
    "AMZN": "consumer_discretionary",
    "TSLA": "consumer_discretionary",
    "WMT": "consumer_staples",
    "KO": "consumer_staples",
    "DIS": "media",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Application ---
    app_name: str = "Alpaca AI Trading Backend"
    environment: str = "development"
    debug: bool = True
    log_level: str = "INFO"
    cors_origins: str = "*"

    # --- Database ---
    database_url: str = "sqlite+aiosqlite:///./trading_dev.db"
    auto_create_db: bool = True

    # --- Broker ---
    broker_mode: str = "mock"  # "mock" | "alpaca"
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_paper: bool = True
    # OAuth2 client-credentials ("API Keys" 2024) — alternative to key/secret
    alpaca_client_id: str = ""
    alpaca_client_secret: str = ""
    alpaca_base_url: str = ""
    alpaca_token_url: str = ""
    alpaca_oauth_token: str = ""
    alpaca_oauth_scope: str = "trading"

    # --- Risk limits ---
    max_position_percent: float = 0.15
    max_sector_exposure_percent: float = 0.40
    min_cash_percent: float = 0.10
    max_daily_loss_percent: float = 0.05
    max_drawdown_percent: float = 0.10

    # Optional JSON override, e.g. SECTOR_MAP_JSON='{"NVDA":"technology"}'
    sector_map_json: str = ""

    # --- Mock broker / background tasks ---
    mock_initial_cash: float = 100_000.0
    mock_price_tick_seconds: float = 5.0
    order_poll_seconds: float = 2.0
    # JSON file the mock broker snapshots state to across restarts; "" disables.
    mock_state_path: str = ".mock_broker_state.json"

    @property
    def sector_map(self) -> dict[str, str]:
        raw = (self.sector_map_json or "").strip()
        if not raw:
            return dict(DEFAULT_SECTOR_MAP)
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return {str(k).upper(): str(v) for k, v in parsed.items()}
        except json.JSONDecodeError:
            pass
        return dict(DEFAULT_SECTOR_MAP)


@lru_cache
def get_settings() -> Settings:
    return Settings()
