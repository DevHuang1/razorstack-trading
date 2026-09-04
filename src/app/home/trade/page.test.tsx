import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TradePage from "./page";

function approvedResponse(): Response {
  return new Response(
    JSON.stringify({ risk: { status: "APPROVED" }, order: { order_id: "o-1", status: "SUBMITTED" } }),
    { status: 200 },
  );
}

function renderTrade() {
  render(<TradePage />);
  return screen.getByRole("textbox", { name: "Symbol" });
}

describe("Trade page", () => {
  it("renders the order entry with Buy and Sell", () => {
    renderTrade();
    expect(screen.getByRole("textbox", { name: "Symbol" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Quantity" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sell" })).toBeInTheDocument();
  });

  it("sends a buy order through the risk engine on Buy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(approvedResponse());
    vi.stubGlobal("fetch", fetchMock);

    renderTrade();
    fireEvent.change(screen.getByRole("textbox", { name: "Symbol" }), {
      target: { value: "aapl" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Quantity" }), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buy" }));

    await waitFor(() => expect(screen.getByText(/APPROVED/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trades/propose",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      symbol: "AAPL",
      side: "buy",
      quantity: 10,
      agent_id: "research-desk",
      order_type: "market",
    });
    vi.unstubAllGlobals();
  });

  it("sends a sell order on Sell and settles back to approved", async () => {
    const fetchMock = vi.fn().mockResolvedValue(approvedResponse());
    vi.stubGlobal("fetch", fetchMock);

    renderTrade();
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));

    await waitFor(() => expect(screen.getByText(/APPROVED/)).toBeInTheDocument());
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<string, unknown>;
    expect(body).toMatchObject({ symbol: "NVDA", side: "sell", quantity: 10 });
    vi.unstubAllGlobals();
  });

  it("shows validation errors for a bad ticker and bad quantity", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderTrade();
    fireEvent.change(screen.getByRole("textbox", { name: "Symbol" }), {
      target: { value: "AAPL!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    expect(
      await screen.findByText("Enter a valid ticker symbol, for example NVDA."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Symbol" }), {
      target: { value: "NVDA" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Quantity" }), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    expect(
      await screen.findByText("Enter a positive whole-number quantity."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});