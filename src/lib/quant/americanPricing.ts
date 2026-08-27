export interface AmericanPutParams {
  spot: number;
  strike: number;
  riskFree: number;
  sigma: number;
  maturity: number;
  american?: boolean;
  gridSteps?: number;
  timeSteps?: number;
  zMax?: number;
}

export interface AmericanPutResult {
  spot: number;
  strike: number;
  riskFree: number;
  sigma: number;
  maturity: number;
  american: boolean;
  price: number;
  earlyExercisePremium: number;
  europeanPrice: number;
  freeBoundaryPrice: number;
  exercised: boolean;
  gridSteps: number;
  timeSteps: number;
}

function payoff(j: number, N: number, K: number, S0: number, dz: number, zMin: number): number {
  const S = S0 * Math.exp(zMin + j * dz);
  return Math.max(K - S, 0);
}

function solveAmerican(
  spot: number,
  strike: number,
  riskFree: number,
  sigma: number,
  maturity: number,
  american: boolean,
  N: number,
  M: number,
  zMax: number,
): { priceAtSpot: number; freeBoundary: number; exercised: boolean } {
  const zMin = -zMax;
  const dz = (zMax - zMin) / N;
  const dtau = maturity / M;

  const mu = riskFree - 0.5 * sigma * sigma;

  const aCoeff = 0.5 * sigma * sigma / (dz * dz) - mu / (2 * dz);
  const bCoeff = -sigma * sigma / (dz * dz) - riskFree;
  const cCoeff = 0.5 * sigma * sigma / (dz * dz) + mu / (2 * dz);

  let u: number[] = new Array(N + 1);
  for (let j = 0; j <= N; j++) u[j] = payoff(j, N, strike, spot, dz, zMin);

  const low = new Array(N + 1).fill(0);
  const diag = new Array(N + 1).fill(0);
  const upp = new Array(N + 1).fill(0);
  const rhs = new Array(N + 1).fill(0);

  for (let n = 0; n < M; n++) {
    for (let j = 1; j < N; j++) {
      low[j] = (dtau / 2) * -aCoeff;
      diag[j] = 1 - (dtau / 2) * bCoeff;
      upp[j] = (dtau / 2) * -cCoeff;
      rhs[j] =
        u[j] +
        (dtau / 2) * (aCoeff * u[j - 1] + bCoeff * u[j] + cCoeff * u[j + 1]);
    }

    low[0] = 0;
    diag[0] = 1;
    upp[0] = 0;
    rhs[0] = u[0];

    low[N] = 0;
    diag[N] = 1;
    upp[N] = 0;
    rhs[N] = u[N];

    const next = projectedSOR(low, diag, upp, rhs, u, american ? (j: number) => payoff(j, N, strike, spot, dz, zMin) : null, N);

    if (american) {
      for (let j = 0; j <= N; j++) u[j] = Math.max(next[j], payoff(j, N, strike, spot, dz, zMin));
    } else {
      u = next;
    }
  }

  const spotIndexExact = -zMin / dz;
  let priceAtSpot: number;
  if (Math.abs(spotIndexExact - Math.round(spotIndexExact)) < 1e-9) {
    priceAtSpot = u[Math.round(spotIndexExact)];
  } else {
    const j0 = Math.floor(spotIndexExact);
    const j1 = Math.min(N, j0 + 1);
    const alpha = spotIndexExact - j0;
    priceAtSpot = u[j0] * (1 - alpha) + u[j1] * alpha;
  }

  let freeBoundary = 0;
  let exercised = false;
  if (american) {
    const tol = Math.max(1e-6, Math.abs(priceAtSpot) * 1e-6);
    let foundTransition = false;
    for (let j = 0; j <= N; j++) {
      if (u[j] > payoff(j, N, strike, spot, dz, zMin) + tol) {
        if (j === 0) {
          freeBoundary = spot * Math.exp(zMin);
        } else {
          const S = spot * Math.exp(zMin + (j - 1) * dz);
          freeBoundary = S;
        }
        foundTransition = true;
        break;
      }
    }
    if (!foundTransition) {
      freeBoundary = spot * Math.exp(zMax);
    }
    exercised = spot < freeBoundary;
  }

  return { priceAtSpot, freeBoundary, exercised };
}

function projectedSOR(
  low: number[],
  diag: number[],
  upp: number[],
  rhs: number[],
  u0: number[],
  project: ((j: number) => number) | null,
  N: number,
): number[] {
  const u = [...u0];
  const omega = 1.2;
  const maxIter = 5000;
  const tol = 1e-8;

  for (let iter = 0; iter < maxIter; iter++) {
    let maxDiff = 0;
    for (let j = 1; j < N; j++) {
      const sum = rhs[j] - low[j] * u[j - 1] - upp[j] * u[j + 1];
      const newVal = (1 - omega) * u[j] + (omega / diag[j]) * sum;
      const val = project ? Math.max(newVal, project(j)) : newVal;
      maxDiff = Math.max(maxDiff, Math.abs(val - u[j]));
      u[j] = val;
    }
    if (maxDiff < tol) break;
  }
  return u;
}

export function priceAmericanPut(params: AmericanPutParams): AmericanPutResult {
  const N = params.gridSteps ?? 200;
  const M = params.timeSteps ?? 400;
  const zMax = params.zMax ?? 8;
  const american = params.american ?? true;

  const americanResult = solveAmerican(
    params.spot,
    params.strike,
    params.riskFree,
    params.sigma,
    params.maturity,
    true,
    N,
    M,
    zMax,
  );

  let europeanPrice: number;
  let freeBoundaryPrice = 0;
  let exercised = false;
  if (american) {
    const e = solveAmerican(
      params.spot,
      params.strike,
      params.riskFree,
      params.sigma,
      params.maturity,
      false,
      N,
      M,
      zMax,
    );
    europeanPrice = e.priceAtSpot;
    freeBoundaryPrice = americanResult.freeBoundary;
    exercised = americanResult.exercised;
  } else {
    europeanPrice = americanResult.priceAtSpot;
  }

  const price = americanResult.priceAtSpot;
  const premium = price - europeanPrice;

  return {
    spot: params.spot,
    strike: params.strike,
    riskFree: params.riskFree,
    sigma: params.sigma,
    maturity: params.maturity,
    american,
    price: round(price, 4),
    earlyExercisePremium: round(premium, 4),
    europeanPrice: round(europeanPrice, 4),
    freeBoundaryPrice: round(freeBoundaryPrice, 2),
    exercised,
    gridSteps: N,
    timeSteps: M,
  };
}

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
