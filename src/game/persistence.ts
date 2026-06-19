/** Tiny localStorage-backed progress store. No backend; safe outside the DOM. */

export interface Progress {
  bestScores: Record<string, number>; // scenarioId -> best score
  settings: {
    difficultyId?: string;
    view?: string;
    mirrors?: boolean;
    realisticWheel?: boolean; // on-screen wheel turns at the real steering ratio
    mirrorsOnly?: boolean; // back up using only the camera + mirrors (no top-down)
  };
}

const KEY = "jackknife.v1";

const empty = (): Progress => ({ bestScores: {}, settings: {} });

export function loadProgress(): Progress {
  if (typeof localStorage === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...(JSON.parse(raw) as Progress) };
  } catch {
    return empty();
  }
}

export function saveProgress(p: Progress): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* quota / privacy mode: ignore */
  }
}

export function recordBest(scenarioId: string, score: number): Progress {
  const p = loadProgress();
  if (!(scenarioId in p.bestScores) || score > p.bestScores[scenarioId]) {
    p.bestScores[scenarioId] = score;
    saveProgress(p);
  }
  return p;
}

/** Wipe all stored best scores (settings are kept). */
export function clearBestScores(): Progress {
  const p = loadProgress();
  p.bestScores = {};
  saveProgress(p);
  return p;
}

/** Persist the realistic-wheel preference. */
export function setRealisticWheel(on: boolean): void {
  const p = loadProgress();
  p.settings.realisticWheel = on;
  saveProgress(p);
}

/** Persist the mirrors-only (no top-down) preference. */
export function setMirrorsOnly(on: boolean): void {
  const p = loadProgress();
  p.settings.mirrorsOnly = on;
  saveProgress(p);
}
