"""End-to-end demo against a running server.

Usage:
    .\\.venv\\Scripts\\python.exe scripts\\demo.py [base_url]

Default base_url is http://127.0.0.1:8000. Requires BROKER_MODE=mock.
Walks through every risk outcome: approved, adjusted, rejected, resting
limit order + manual tick fill, then prints the final state.
"""
import sys

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
client = httpx.Client(base_url=BASE, timeout=15.0)


def step(title: str) -> None:
    print(f"\n{'=' * 62}\n{title}\n{'=' * 62}")


def show(resp: httpx.Response, keys: dict[str, str]) -> None:
    if resp.status_code >= 400:
        print(f"  HTTP {resp.status_code}: {resp.json()}")
        return
    body = resp.json()
    for label, path in keys.items():
        value = body
        for part in path.split("."):
            value = value[part] if isinstance(value, dict) else value
        print(f"  {label:<28} {value}")


def propose(**overrides) -> dict:
    payload = {
        "agent_id": "demo-agent",
        "symbol": "AAPL",
        "side": "buy",
        "quantity": 5,
        "order_type": "market",
        "confidence": 0.9,
        "strategy": "demo",
    }
    payload.update(overrides)
    resp = client.post("/trades/propose", json=payload)
    return resp.json()


step(f"Demo against {BASE}")
print(client.post("/admin/reset").text)
print(client.get("/health").json())

step("1) APPROVED — small market buy (10 NVDA)")
show_ok = client.post(
    "/trades/propose",
    json={"agent_id": "demo-agent", "symbol": "NVDA", "side": "buy", "quantity": 10,
          "order_type": "market", "confidence": 0.95, "strategy": "demo"},
)
show(show_ok, {"risk status": "risk.status", "message": "message",
               "filled at avg $": "order.avg_fill_price"})

step("2) ADJUSTED — 100 TSLA exceeds the 15% position cap")
show(client.post(
    "/trades/propose",
    json={"agent_id": "demo-agent", "symbol": "TSLA", "side": "buy", "quantity": 100,
          "order_type": "market", "confidence": 0.8, "strategy": "demo"},
), {"risk status / code": "risk.status", "scaled to qty": "risk.approved_quantity",
    "code": "risk.code", "message": "message"})

step("3) REJECTED — absurd limit price can't fit even one share")
show(client.post(
    "/trades/propose",
    json={"agent_id": "demo-agent", "symbol": "MSFT", "side": "buy", "quantity": 1_000_000,
          "order_type": "limit", "limit_price": 50_000.0,
          "confidence": 0.99, "strategy": "demo"},
), {"risk status / code": "risk.code", "approved qty": "risk.approved_quantity",
    "message": "message"})

step("4) Resting limit order -> filled by a price tick")
quote = client.get("/market/GOOGL").json()
limit_price = round(quote["price"] * 0.90, 2)
print(f"  GOOGL market=${quote['price']}  placing buy limit @ ${limit_price}")
result = client.post(
    "/trades/propose",
    json={"agent_id": "demo-agent", "symbol": "GOOGL", "side": "buy", "quantity": 3,
          "order_type": "limit", "limit_price": limit_price,
          "confidence": 0.7, "strategy": "demo"},
).json()
order_id = result["order"]["id"]
print(f"  order {order_id} status={result['order']['status']} (resting)")

for attempt in range(1, 11):
    tick = client.post("/admin/tick").json()
    if tick["filled_order_ids"]:
        print(f"  tick #{attempt} filled: {tick['fills']}")
        break
    print(f"  tick #{attempt} no cross yet")
else:
    client.post(f"/admin/fill-now/{order_id}")
    print("  forced via /admin/fill-now")

status = client.get(f"/orders/{order_id}").json()
print(f"  final order status: {status['status']} @ ${status['avg_fill_price']}")

step("Final state")
risk = client.get("/risk/status").json()
print(f"  restricted={risk['restricted_mode']} score={risk['metrics']['risk_score']}"
      f" top_symbol={risk['metrics']['top_symbol']}")

portfolio = client.get("/portfolio").json()
print(f"  equity=${portfolio['equity']:,.2f}  cash=${portfolio['cash']:,.2f}  pnl={portfolio['daily_pnl']:+,.2f}")
for p in portfolio["positions"]:
    print(f"   - {p['symbol']:<6} {p['quantity']:>4} shares  sector={p['sector']:<22} "
          f"value=${p['market_value']:>10,.2f}")

events = client.get("/events?limit=20").json()
print(f"\n  event timeline ({len(events)} recent):")
for ev in reversed(events):
    print(f"   {ev['timestamp'][11:19]}  {ev['event_type']:<22} "
          f"{ev['payload'].get('symbol') or ev['payload'].get('equity', '')}")

print("\nDone. Open the live dashboard at", BASE, "\n")
