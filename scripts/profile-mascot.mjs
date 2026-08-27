import fs from "node:fs/promises";
import path from "node:path";
import { chromium, firefox, webkit } from "@playwright/test";

const targetUrl = process.env.MASCOT_URL ?? "http://127.0.0.1:3000/research";
const durationMs = Number(process.env.MASCOT_PROFILE_MS ?? 3000);
const states = ["idle", "thinking", "speaking", "success"];
const engines = { chromium, firefox, webkit };

async function profileState(page, state) {
  return page.evaluate(async ({ state, durationMs }) => {
    const mascots = [...document.querySelectorAll(".mascot-shell")];
    for (const mascot of mascots) {
      mascot.classList.remove(
        "mascot-state-idle",
        "mascot-state-thinking",
        "mascot-state-speaking",
        "mascot-state-success",
      );
      mascot.classList.add(`mascot-state-${state}`);
      mascot.setAttribute("data-mascot-state", state);
    }

    const intervals = [];
    const longTasks = [];
    const observer = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")
      ? new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push(entry.duration);
        })
      : null;
    observer?.observe({ entryTypes: ["longtask"] });

    let last = null;
    const started = performance.now();
    await new Promise((resolve) => {
      const frame = (now) => {
        if (last !== null) intervals.push(now - last);
        last = now;
        if (now - started < durationMs) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    observer?.disconnect();

    const sorted = [...intervals].sort((a, b) => a - b);
    const mean = intervals.reduce((sum, value) => sum + value, 0) / Math.max(intervals.length, 1);
    const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
    const droppedFrames = intervals.filter((interval) => interval > 1000 / 50).length;
    return {
      state,
      frames: intervals.length,
      meanFrameMs: Number(mean.toFixed(2)),
      p95FrameMs: Number(percentile(0.95).toFixed(2)),
      estimatedFps: Number((1000 / Math.max(mean, 0.001)).toFixed(2)),
      droppedFramePct: Number(((droppedFrames / Math.max(intervals.length, 1)) * 100).toFixed(2)),
      longTaskCount: longTasks.length,
      maxLongTaskMs: Number(Math.max(0, ...longTasks).toFixed(2)),
    };
  }, { state, durationMs });
}

const results = [];
for (const [name, browserType] of Object.entries(engines)) {
  let browser;
  try {
    browser = await browserType.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(targetUrl, { waitUntil: "networkidle" });
    await page.waitForSelector(".mascot-shell");
    for (const state of states) {
      results.push({ engine: name, ...(await profileState(page, state)) });
    }
    await browser.close();
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    results.push({ engine: name, error: error instanceof Error ? error.message : String(error) });
  }
}

const output = {
  targetUrl,
  durationMs,
  generatedAt: new Date().toISOString(),
  results,
};
const outputPath = path.resolve("reports/mascot-profile.json");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
