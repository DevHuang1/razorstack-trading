const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

const AGENT_LABELS = {
  news: "NEWS AGENT",
  market: "MARKET RESEARCH AGENT",
  bull: "BULL AGENT",
  bear: "BEAR AGENT",
  cio: "CIO",
};

function stanceColor(stance) {
  return stance === "bullish" ? ANSI.green : stance === "bearish" ? ANSI.red : ANSI.yellow;
}

function wrap(text, width = 96) {
  return text
    .split("\n")
    .map((paragraph) => {
      const lines = [];
      let line = "";
      for (const word of paragraph.split(" ")) {
        if (line && `${line} ${word}`.length > width) {
          lines.push(line);
          line = word;
        } else {
          line = line ? `${line} ${word}` : word;
        }
      }
      if (line) lines.push(line);
      return lines.join("\n");
    })
    .join("\n");
}

function printMessage(message) {
  const color = stanceColor(message.stance);
  const confidence = message.confidence != null ? ` · ${message.confidence}%` : "";
  console.log(
    `\n${ANSI.bold}${ANSI.cyan}${AGENT_LABELS[message.role] ?? message.role}${ANSI.reset}` +
      `${color} [${message.stance.toUpperCase()}${confidence}]${ANSI.reset}`,
  );
  console.log(`${ANSI.bold}${message.headline}${ANSI.reset}`);
  console.log(wrap(message.body));
  for (const point of message.keyPoints ?? []) {
    console.log(`  ${ANSI.dim}•${ANSI.reset} ${point}`);
  }
}

function printContext(snapshot, newsCount) {
  console.log(`\n${ANSI.bold}MARKET CONTEXT${ANSI.reset}`);
  const day = snapshot.change1dPct >= 0 ? `+${snapshot.change1dPct}` : `${snapshot.change1dPct}`;
  console.log(
    `${snapshot.symbol} ${ANSI.bold}$${snapshot.price}${ANSI.reset} (${day}% today)` +
      `${ANSI.dim} · RSI ${snapshot.rsi14} · vol ${snapshot.realizedVol30dAnnPct}% · ${snapshot.sector} · regime ${snapshot.regime.replace("_", "-")} · ${newsCount} news items${ANSI.reset}`,
  );
}

function printThesis(thesis) {
  const dirColor =
    thesis.direction === "BULLISH"
      ? ANSI.green
      : thesis.direction === "BEARISH"
        ? ANSI.red
        : ANSI.yellow;
  const strategy = thesis.suggestedStrategy;
  console.log(`\n${"=".repeat(62)}`);
  console.log(`${ANSI.bold}AI THESIS — CIO SYNTHESIS${ANSI.reset}`);
  console.log(
    `${thesis.symbol} — ${dirColor}${ANSI.bold}${thesis.direction}${ANSI.reset} ${dirColor}@ ${thesis.confidence}%${ANSI.reset}`,
  );
  console.log(wrap(thesis.summary));
  console.log(`\n${ANSI.green}Catalysts:${ANSI.reset}`);
  for (const c of thesis.catalysts) console.log(`  + ${c}`);
  console.log(`\n${ANSI.red}Risks:${ANSI.reset}`);
  for (const r of thesis.risks) console.log(`  - ${r}`);
  console.log(`\n${ANSI.bold}Recommendation:${ANSI.reset} ${thesis.recommendation}`);
  console.log(
    `\n${ANSI.bold}Strategy:${ANSI.reset} ${strategy.structure.replace(/_/g, " ")}` +
      `${ANSI.dim} · est. max risk $${strategy.estimatedMaxRiskUsd.toLocaleString()}${ANSI.reset}`,
  );
  console.log(`${ANSI.dim}${wrap(strategy.rationale)}${ANSI.reset}`);
  console.log("=".repeat(62));
}

async function main() {
  const symbol = (process.argv[2] ?? "").toUpperCase();
  if (!symbol || symbol.length > 6) {
    console.error("Usage: node scripts/demo-research.mjs <SYMBOL>");
    process.exit(1);
  }

  const baseUrl = process.env.RESEARCH_URL ?? "http://localhost:3000";
  console.log(`${ANSI.dim}AI Trading Desk — research desk live feed (${symbol})${ANSI.reset}`);

  const response = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol }),
  });
  if (!response.ok) {
    console.error(`Request failed: ${response.status}`, await response.text());
    process.exit(1);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      switch (event.type) {
        case "status":
          console.log(`${ANSI.dim}> ${event.detail}${ANSI.reset}`);
          break;
        case "context":
          printContext(event.snapshot, event.newsCount);
          break;
        case "agent_message":
          printMessage(event.message);
          break;
        case "thesis":
          printThesis(event.thesis);
          break;
        case "error":
          console.error(`${ANSI.red}ERROR [${event.step}]: ${event.message}${ANSI.reset}`);
          break;
        case "done":
          break;
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
