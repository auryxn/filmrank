/**
 * localStorage persistence helpers.
 * All app state lives under a single versioned key so "reset" is trivial.
 */

const STORAGE_KEY = 'filmrank:v1';

const EMPTY = {
  catalog: [],       // TMDB movies fetched for swiping
  catalogIndex: 0,   // current swipe position
  watched: [],       // full movie objects marked "смотрел"
  watchlist: [],     // full movie objects marked "хочу посмотреть"
  notWatched: [],    // ids marked "не смотрел" (to avoid re-showing)
  unsureWatch: [],   // ids marked "не помню" on the swipe screen
  rank: null,        // engine state (engine/rank.js shape)
};

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export { STORAGE_KEY };
