"""Dev/judge account isolation: two independent stacks, separate data."""
from fastapi.testclient import TestClient

BASE = {"agent_id": "pytest-agent", "confidence": 0.9, "strategy": "unit-test"}


def payload(**overrides) -> dict:
    body = {
        **BASE,
        "symbol": "AAPL",
        "side": "buy",
        "quantity": 5,
        "order_type": "market",
    }
    body.update(overrides)
    return body


def test_two_stacks_exist_and_are_distinct(client: TestClient):
    stacks = client.app.state.stacks
    assert set(stacks) == {"dev", "judge"}
    assert stacks["dev"] is not stacks["judge"]
    assert stacks["dev"]["broker"] is not stacks["judge"]["broker"]
    assert stacks["dev"]["portfolio"] is not stacks["judge"]["portfolio"]


def test_default_role_is_dev(client: TestClient):
    resp = client.post("/trades/propose", json=payload())
    assert resp.status_code == 200
    assert resp.json()["order"]["status"] == "FILLED"
    dev_orders = client.get("/orders").json()
    judge_orders = client.get("/orders", headers={"X-Account-Role": "judge"}).json()
    assert dev_orders, "default-role order must land in the dev stack"
    assert judge_orders == [], "judge stack must not see dev orders"


def test_judge_role_is_isolated(client: TestClient):
    resp = client.post(
        "/trades/propose", json=payload(), headers={"X-Account-Role": "judge"}
    )
    assert resp.status_code == 200
    judge_orders = client.get("/orders", headers={"X-Account-Role": "judge"}).json()
    dev_orders = client.get("/orders", headers={"X-Account-Role": "dev"}).json()
    assert len(judge_orders) == 1
    assert dev_orders == [], "dev stack must not see judge orders"


def test_invalid_role_falls_back_to_dev(client: TestClient):
    assert client.get("/orders", headers={"X-Account-Role": "admin"}).json() == []
    # A request with a garbage role must not 500 nor bleed into judge.
    assert client.get("/orders", headers={"X-Account-Role": "other"}).status_code == 200


def test_events_are_scoped_per_role(client: TestClient):
    judge = client.post(
        "/trades/propose", json=payload(), headers={"X-Account-Role": "judge"}
    ).json()
    dev = client.post("/trades/propose", json=payload()).json()
    judge_pid = judge["proposal"]["id"]
    dev_pid = dev["proposal"]["id"]
    assert judge_pid != dev_pid

    judge_events = client.get("/events", headers={"X-Account-Role": "judge"}).json()
    dev_events = client.get("/events", headers={"X-Account-Role": "dev"}).json()

    def proposal_ids(events: list[dict]) -> set[str]:
        ids: set[str] = set()
        for e in events:
            pid = e["payload"].get("proposal_id")
            if pid:
                ids.add(pid)
        return ids

    assert proposal_ids(judge_events) == {judge_pid}
    assert proposal_ids(dev_events) == {dev_pid}