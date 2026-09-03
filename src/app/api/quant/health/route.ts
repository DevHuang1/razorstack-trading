/**
 * /api/quant/health — reports data source and backend availability
 * Called by the Quant Desk page to show live connection status.
 */

export const dynamic = "force-dynamic";

interface HealthReport {
  alpaca: {
    configured: boolean;
    live: boolean;
    error?: string;
  };
  backend: {
    configured: boolean;
    live: boolean;
    url?: string;
    error?: string;
  };
}

async function checkAlpaca(): Promise<HealthReport["alpaca"]> {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secretKey = process.env.ALPACA_API_SECRET_KEY;
  if (!keyId || !secretKey) {
    return { configured: false, live: false };
  }
  try {
    const res = await fetch("https://data.alpaca.markets/v2/stocks/SPY/bars?timeframe=1Day&limit=1&sort=desc", {
      headers: {
        "APCA-API-KEY-ID": keyId,
        "APCA-API-SECRET-KEY": secretKey,
      },
      signal: AbortSignal.timeout(5000),
    });
    return { configured: true, live: res.ok };
  } catch (err) {
    return {
      configured: true,
      live: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

async function checkBackend(): Promise<HealthReport["backend"]> {
  const url = process.env.BACKEND_API_URL;
  if (!url) {
    return { configured: false, live: false };
  }
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return { configured: true, live: res.ok, url };
  } catch (err) {
    return {
      configured: true,
      live: false,
      url,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

export async function GET() {
  const [alpaca, backend] = await Promise.all([checkAlpaca(), checkBackend()]);
  const report: HealthReport = { alpaca, backend };
  return Response.json(report);
}
