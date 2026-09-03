import { afterEach, describe, expect, it } from "vitest";
import { clear, leaderboard, listPaperRecords, recordSignal, resolveOutcome } from "./paper-store";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const FILE = path.join(os.tmpdir(), `quant-paper-test-${process.pid}.json`);

afterEach(async () => {
  try {
    await fs.unlink(FILE);
  } catch {
    /* ignore */
  }
});

describe("backend paper store", () => {
  it("records and lists signals, persisting to disk", async () => {
    await clear({ file: FILE });
    const rec = await recordSignal(
      {
        symbol: "aapl",
        strategy: "MOMENTUM",
        modelVersion: "v1",
        timeframe: "1Day",
        horizonDays: 5,
        entryPrice: 100,
        direction: "BUY",
      },
      { file: FILE },
    );
    expect(rec.symbol).toBe("AAPL");
    const listed = await listPaperRecords({ file: FILE });
    expect(listed.length).toBe(1);
    const onDisk = JSON.parse(await fs.readFile(FILE, "utf8"));
    expect(onDisk.length).toBe(1);
    expect(onDisk[0].symbol).toBe("AAPL");
  });

  it("resolves outcomes and builds a leaderboard sorted by PnL", async () => {
    await clear({ file: FILE });
    const win = await recordSignal(
      { symbol: "A", strategy: "MOMENTUM", modelVersion: "v1", timeframe: "1Day", horizonDays: 5, entryPrice: 100, direction: "BUY" },
      { file: FILE },
    );
    const lose = await recordSignal(
      { symbol: "B", strategy: "NEWS", modelVersion: "v1", timeframe: "1Day", horizonDays: 5, entryPrice: 100, direction: "BUY" },
      { file: FILE },
    );
    await resolveOutcome(win.id, 120, { file: FILE });
    await resolveOutcome(lose.id, 90, { file: FILE });

    const lb = await leaderboard({ file: FILE });
    expect(lb[0].strategy).toBe("MOMENTUM");
    expect(lb[0].winRatePct).toBe(100);
    expect(lb.find((e) => e.strategy === "NEWS")!.winRatePct).toBe(0);
  });

  it("returns null when resolving an unknown id", async () => {
    await clear({ file: FILE });
    expect(await resolveOutcome("nope", 100, { file: FILE })).toBeNull();
  });
});
