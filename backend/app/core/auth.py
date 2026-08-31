"""API-key authentication for mutating and admin endpoints.

Auth is opt-in: when ``Settings.api_key`` is empty the dependency is a no-op so
local development and the test-suite run unchanged. When a key is configured,
clients must present it via the ``X-API-Key`` header or
``Authorization: Bearer <key>``; mismatches return 401.

The key is read from ``app.state.settings`` (the per-app settings object) rather
than the global ``get_settings()`` cache, so an app constructed with an explicit
settings instance enforces its own key.
"""
import hmac

from fastapi import Header, HTTPException, Request, status


def _secure_compare(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


async def require_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> None:
    """Guard dependency: enforces the configured API key, or passes if unset."""
    expected = request.app.state.settings.api_key
    if not expected:
        return

    provided = x_api_key
    if authorization and authorization.lower().startswith("bearer "):
        provided = authorization.split(" ", 1)[1].strip()

    if not provided or not _secure_compare(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
            headers={"WWW-Authenticate": "APIKey"},
        )
