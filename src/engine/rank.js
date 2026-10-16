/**
 * FilmRank ranking engine (pure, no React imports).
 *
 * Maintains an ordered list of watched movies. Newly added movies are placed
 * using binary-insertion: a binary search over the current ordered list
 * determines the insertion index, requiring ~log2(n) duels instead of O(n)
 * (round-robin would be O(n^2) total).
 *
 * A "duel" is a comparison between a NEW/candidate movie and an anchor movie
 * already in the ordered list. The user answers which is better; the engine
 * narrows the insertion window (lo/hi) accordingly.
 *
 * State shape (persisted):
 * {
 *   order: number[],                       // movie ids, best -> worst
 *   pending: null | {                      // active binary-insertion job
 *     movie: object,                       // full movie object being inserted
 *     lo: number, hi: number,              // search window in `order`
 *     lastCompareId: number | null,        // id of anchor last asked (for tie/unsure)
 *     compareAnchorId: number | null
 *   },
 *   queue: object[],                       // movies waiting to be inserted
 *   unsure: number[],                      // anchor ids the user couldn't compare (re-queued)
 * }
 */

export const STATE_VERSION = 1;

export function createState() {
  return {
    version: STATE_VERSION,
    order: [],
    pending: null,
    queue: [],
    unsure: [],
  };
}

/** Deep-ish clone to keep engine immutable from the UI side. */
export function clone(state) {
  return {
    version: state.version ?? STATE_VERSION,
    order: [...(state.order || [])],
    pending: state.pending ? { ...state.pending } : null,
    queue: (state.queue || []).map((m) => ({ ...m })),
    unsure: [...(state.unsure || [])],
  };
}

function movieId(m) {
  return m && typeof m === 'object' ? m.id : m;
}

/**
 * Add a movie to the ranking pool. If it is already ranked (or queued) it is
 * ignored (returns the same state). Otherwise it is enqueued and, if no duel
 * is active, a binary-insertion job is started.
 */
export function addMovie(state, movie) {
  const next = clone(state);
  const id = movieId(movie);
  if (id == null) return next;

  if (next.order.includes(id)) return next;
  if (next.pending && movieId(next.pending.movie) === id) return next;
  if (next.queue.some((m) => movieId(m) === id)) return next;

  next.queue.push({ ...movie });
  return startNext(next);
}

/** Add many movies at once. */
export function addMovies(state, movies) {
  let next = clone(state);
  for (const m of movies || []) {
    const id = movieId(m);
    if (id == null) continue;
    if (next.order.includes(id)) continue;
    if (next.pending && movieId(next.pending.movie) === id) continue;
    if (next.queue.some((q) => movieId(q) === id)) continue;
    next.queue.push({ ...m });
  }
  return startNext(next);
}

/** Remove a movie from order/queue/unsure. */
export function removeMovie(state, movieIdRaw) {
  const next = clone(state);
  const id = movieId(movieIdRaw);
  next.order = next.order.filter((x) => x !== id);
  next.queue = next.queue.filter((m) => movieId(m) !== id);
  next.unsure = next.unsure.filter((x) => x !== id);
  if (next.pending && movieId(next.pending.movie) === id) next.pending = null;
  return startNext(next);
}

/**
 * Begin the next binary-insertion job if none is active and the queue is
 * non-empty. Returns the (possibly updated) state.
 */
export function startNext(state) {
  const next = clone(state);
  if (next.pending) return next;
  if (!next.queue.length) return next;

  const movie = next.queue.shift();
  const mid = movieId(movie);
  if (next.order.includes(mid)) return startNext(next);

  const hi = next.order.length;

  // Empty ranking (or otherwise collapsed window): no duel needed, insert now.
  if (hi === 0) {
    next.order.push(mid);
    return startNext(next);
  }

  next.pending = {
    movie: { ...movie },
    lo: 0,
    hi,
    lastCompareId: null,
    compareAnchorId: null,
  };
  return next;
}

/**
 * The next pending comparison the UI should present, or null when idle.
 * Returns { movie, anchor, lo, hi, progress } where `anchor` is the movie
 * object (resolved via `lookup`) the candidate is compared against.
 */
export function nextComparison(state, lookup) {
  const p = state.pending;
  if (!p) return null;

  // Window collapsed: insertion point found.
  if (p.lo >= p.hi) return null;

  const mid = Math.floor((p.lo + p.hi) / 2);
  const anchorId = state.order[mid];

  let anchor = anchorId;
  if (typeof lookup === 'function') anchor = lookup(anchorId);

  // If we cannot resolve the anchor object, degrade gracefully.
  if (anchor == null) return null;

  return {
    movie: p.movie,
    anchor,
    anchorId,
    index: mid,
    lo: p.lo,
    hi: p.hi,
    remaining: Math.ceil(Math.log2(Math.max(1, p.hi - p.lo))),
    progress: {
      done: Math.max(0, Math.floor(Math.log2(Math.max(1, state.order.length + 1))) - Math.ceil(Math.log2(Math.max(1, p.hi - p.lo)))),
      total: Math.max(1, Math.floor(Math.log2(Math.max(1, state.order.length + 1)))),
    },
  };
}

/** Insert the pending candidate at its resolved window position. */
function finalize(state) {
  const next = clone(state);
  const p = next.pending;
  if (!p) return next;
  const id = movieId(p.movie);
  if (!next.order.includes(id)) {
    next.order.splice(p.lo, 0, id);
  }
  next.pending = null;
  return startNext(next);
}

/**
 * Resolve the current duel.
 *
 * @param {'a'|'b'|'tie'|'unsure'} result
 *   'a'      -> the candidate (new movie) is better than the anchor
 *   'b'      -> the anchor is better (candidate goes below the anchor)
 *   'tie'    -> treat candidate as equal; place just after the anchor window
 *   'unsure' -> abandon this anchor comparison and re-queue the candidate
 */
export function resolveDuel(state, result) {
  const next = clone(state);
  const p = next.pending;
  if (!p) return next;

  if (p.lo >= p.hi) return finalize(next);

  const mid = Math.floor((p.lo + p.hi) / 2);
  const anchorId = next.order[mid];

  if (result === 'a') {
    // candidate better -> it belongs in the upper half [lo, mid)
    p.hi = mid;
    p.lastCompareId = anchorId;
  } else if (result === 'b') {
    // anchor better -> candidate belongs in the lower half (mid, hi)
    p.lo = mid + 1;
    p.lastCompareId = anchorId;
  } else if (result === 'tie') {
    // Place candidate directly after the anchor: window becomes [mid+1, mid+1)
    p.lo = mid + 1;
    p.hi = mid + 1;
    p.lastCompareId = anchorId;
    next.pending = p;
    return finalize(next);
  } else if (result === 'unsure') {
    // Remember the anchor so we don't ask it again for this candidate, and
    // re-queue the candidate without ranking it.
    next.unsure.push(anchorId);
    const requeued = { ...p.movie };
    next.pending = null;
    next.queue.push(requeued);
    return startNext(next);
  } else {
    return next;
  }

  if (p.lo >= p.hi) {
    next.pending = p;
    return finalize(next);
  }

  next.pending = p;
  return next;
}

/** Number of active (queued + in-progress) insertions. */
export function pendingCount(state) {
  return (state.queue?.length || 0) + (state.pending ? 1 : 0);
}

/** Full ordered list resolved to movie objects. */
export function orderedMovies(state, lookup) {
  if (typeof lookup !== 'function') return [...state.order];
  return state.order.map((id) => lookup(id)).filter(Boolean);
}

/** Human-readable ranking text (for export). */
export function rankText(state, lookup, limit) {
  const list = orderedMovies(state, lookup);
  const n = limit && limit > 0 ? Math.min(limit, list.length) : list.length;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const m = list[i];
    const title = m?.title || m?.name || `#${state.order[i]}`;
    const year = (m?.release_date || m?.first_air_date || '').slice(0, 4);
    lines.push(`${i + 1}. ${title}${year ? ` (${year})` : ''}`);
  }
  return lines.join('\n');
}

/**
 * Tier buckets S/A/B/C/D/F from the ordered list.
 * Distribution: S top 10%, A next 15%, B next 20%, C next 20%, D next 20%,
 * F remainder.
 */
export const TIERS = ['S', 'A', 'B', 'C', 'D', 'F'];
const TIER_SPLIT = [0.1, 0.25, 0.45, 0.65, 0.85];

export function tierBuckets(state, lookup) {
  const list = orderedMovies(state, lookup);
  const buckets = { S: [], A: [], B: [], C: [], D: [], F: [] };
  const n = list.length;
  if (!n) return buckets;
  for (let i = 0; i < n; i++) {
    const frac = (i + 1) / n;
    let tier = 'F';
    if (n <= 6) {
      // Small sets: one per tier, evenly spread.
      tier = TIERS[Math.min(TIERS.length - 1, Math.floor((i / n) * TIERS.length))];
    } else {
      for (let t = 0; t < TIER_SPLIT.length; t++) {
        if (frac <= TIER_SPLIT[t]) {
          tier = TIERS[t];
          break;
        }
        tier = TIERS[t + 1];
      }
    }
    buckets[tier].push({ rank: i + 1, movie: list[i] });
  }
  return buckets;
}

/** Serialize + deserialize helpers (used by the localStorage layer). */
export function serialize(state) {
  return JSON.stringify({ ...state, version: STATE_VERSION });
}

export function deserialize(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return createState();
    const base = createState();
    return {
      version: parsed.version ?? STATE_VERSION,
      order: Array.isArray(parsed.order) ? parsed.order.filter((x) => x != null) : base.order,
      pending: parsed.pending && parsed.pending.movie ? parsed.pending : null,
      queue: Array.isArray(parsed.queue) ? parsed.queue : base.queue,
      unsure: Array.isArray(parsed.unsure) ? parsed.unsure : base.unsure,
    };
  } catch {
    return createState();
  }
}
