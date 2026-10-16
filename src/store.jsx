import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadState, saveState, clearState } from './storage.js';
import * as engine from './engine/rank.js';
import { fetchCatalog, fetchDirectors } from './api/tmdb.js';

const StoreContext = createContext(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

const MAX_CATALOG = 200;

const DIRECTOR_CACHE_KEY = 'filmrank:directors:v1';

function loadDirectorCache() {
  try {
    const raw = localStorage.getItem(DIRECTOR_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistDirectorCache(cache) {
  try {
    localStorage.setItem(DIRECTOR_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota — ignore */
  }
}

export function useDirectors() {
  const { state } = useStore();
  const [cache, setCache] = useState(() => loadDirectorCache());
  const inFlight = useRef(new Set());

  useEffect(() => {
    const ids = state.watched.map((m) => m.id).filter((id) => id != null);
    const missing = ids.filter((id) => !(id in cache) && !inFlight.current.has(id));
    if (!missing.length) return;
    let cancelled = false;
    const batch = missing.slice(0, 12);
    for (const id of batch) inFlight.current.add(id);
    Promise.all(batch.map((id) => fetchDirectors(id).then((names) => [id, names])))
      .then((entries) => {
        if (cancelled) return;
        setCache((prev) => {
          const next = { ...prev };
          for (const [id, names] of entries) next[id] = names;
          persistDirectorCache(next);
          return next;
        });
      })
      .finally(() => {
        for (const id of batch) inFlight.current.delete(id);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.watched, cache]);

  return cache;
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(() => loadState());
  const [catalogStatus, setCatalogStatus] = useState('idle'); // idle|loading|ready|error
  const [catalogError, setCatalogError] = useState(null);
  const didInit = useRef(false);

  // Persist on every change.
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Ensure engine state exists.
  useEffect(() => {
    setState((s) => (s.rank ? s : { ...s, rank: engine.createState() }));
  }, []);

  const loadCatalog = useCallback(async (force = false) => {
    setCatalogStatus('loading');
    setCatalogError(null);
    try {
      const movies = await fetchCatalog(90);
      setState((s) => {
        if (!force && s.catalog && s.catalog.length) {
          // Merge new ids, keep existing order/position.
          const have = new Set(s.catalog.map((m) => m.id));
          const merged = [...s.catalog];
          for (const m of movies) if (!have.has(m.id)) merged.push(m);
          return { ...s, catalog: merged.slice(0, MAX_CATALOG) };
        }
        return { ...s, catalog: movies.slice(0, MAX_CATALOG), catalogIndex: 0 };
      });
      setCatalogStatus('ready');
    } catch (err) {
      setCatalogError(err?.message || 'Не удалось загрузить каталог');
      setCatalogStatus('error');
    }
  }, []);

  // Initial catalog load.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (!state.catalog || !state.catalog.length) loadCatalog();
    else setCatalogStatus('ready');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentMovie = useMemo(() => {
    const i = state.catalogIndex;
    if (!state.catalog || i < 0 || i >= state.catalog.length) return null;
    return state.catalog[i];
  }, [state.catalog, state.catalogIndex]);

  const movieById = useCallback(
    (id) => (state.catalog || []).find((m) => m.id === id) || null,
    [state.catalog],
  );

  // A lookup that resolves ids from watched/catalog, used by the engine.
  const lookupEngineMovie = useCallback(
    (id) => {
      const w = state.watched.find((m) => m.id === id);
      if (w) return w;
      return movieById(id);
    },
    [state.watched, movieById],
  );

  // ---- Swipe actions ----------------------------------------------------

  const advance = (s) => ({ ...s, catalogIndex: Math.min(s.catalogIndex + 1, s.catalog.length) });

  const markWatched = useCallback((movie) => {
    if (!movie) return;
    setState((s) => {
      let watched = s.watched;
      if (!watched.some((m) => m.id === movie.id)) watched = [...watched, movie];
      const rank = engine.addMovie(s.rank || engine.createState(), movie);
      return advance({ ...s, watched, rank });
    });
  }, []);

  const markNotWatched = useCallback((movie) => {
    if (!movie) return;
    setState((s) => advance({
      ...s,
      notWatched: s.notWatched.includes(movie.id) ? s.notWatched : [...s.notWatched, movie.id],
    }));
  }, []);

  const markWatchlist = useCallback((movie) => {
    if (!movie) return;
    setState((s) => {
      const watchlist = s.watchlist.some((m) => m.id === movie.id)
        ? s.watchlist
        : [...s.watchlist, movie];
      return advance({ ...s, watchlist });
    });
  }, []);

  const markUnsureSwipe = useCallback((movie) => {
    if (!movie) return;
    setState((s) => advance({
      ...s,
      unsureWatch: s.unsureWatch.includes(movie.id) ? s.unsureWatch : [...s.unsureWatch, movie.id],
    }));
  }, []);

  const prevCard = useCallback(() => {
    setState((s) => ({ ...s, catalogIndex: Math.max(0, s.catalogIndex - 1) }));
  }, []);

  // ---- List management --------------------------------------------------

  const removeFromWatched = useCallback((id) => {
    setState((s) => ({
      ...s,
      watched: s.watched.filter((m) => m.id !== id),
      rank: engine.removeMovie(s.rank || engine.createState(), id),
    }));
  }, []);

  const removeFromWatchlist = useCallback((id) => {
    setState((s) => ({ ...s, watchlist: s.watchlist.filter((m) => m.id !== id) }));
  }, []);

  /** Add a movie object straight to the watchlist (used by recommendations). */
  const addToWatchlist = useCallback((movie) => {
    if (!movie || movie.id == null) return;
    setState((s) => (s.watchlist.some((m) => m.id === movie.id)
      ? s
      : { ...s, watchlist: [...s.watchlist, movie] }));
  }, []);

  const moveToWatched = useCallback((id) => {
    setState((s) => {
      const movie = s.watchlist.find((m) => m.id === id);
      if (!movie) return s;
      const watched = s.watched.some((m) => m.id === id) ? s.watched : [...s.watched, movie];
      const rank = engine.addMovie(s.rank || engine.createState(), movie);
      return {
        ...s,
        watchlist: s.watchlist.filter((m) => m.id !== id),
        watched,
        rank,
      };
    });
  }, []);

  // ---- Ranking / duels --------------------------------------------------

  const nextComparison = useMemo(
    () => engine.nextComparison(state.rank || engine.createState(), lookupEngineMovie),
    [state.rank, lookupEngineMovie],
  );

  const resolveDuel = useCallback((result) => {
    setState((s) => ({ ...s, rank: engine.resolveDuel(s.rank || engine.createState(), result) }));
  }, []);

  // ---- Import / Export / Reset -----------------------------------------

  const resetAll = useCallback(() => {
    clearState();
    setState({ ...loadState(), rank: engine.createState() });
    setCatalogStatus('idle');
    loadCatalog(true);
  }, [loadCatalog]);

  /**
   * Import JSON and MERGE into state. Supported shapes:
   *   [id, ...]                       -> watched ids
   *   { watched: [id|movie, ...] }    -> watched
   *   { order: [id|movie, ...] }      -> ranking order (also seeds watched)
   *   { watched, watchlist, order, catalog }   -> full export shape
   * Movies may be plain ids or objects ({id,title,release_date,poster_path,...}).
   */
  const importData = useCallback((json) => {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;

    let watchedIn = [];
    let watchlistIn = [];
    let orderIn = [];
    let catalogIn = [];

    if (Array.isArray(parsed)) {
      watchedIn = parsed;
    } else if (parsed && typeof parsed === 'object') {
      watchedIn = Array.isArray(parsed.watched) ? parsed.watched : [];
      watchlistIn = Array.isArray(parsed.watchlist) ? parsed.watchlist : [];
      orderIn = Array.isArray(parsed.order) ? parsed.order : [];
      catalogIn = Array.isArray(parsed.catalog) ? parsed.catalog : [];
    }

    const toMovie = (x) => (x && typeof x === 'object' ? x : { id: x });
    const norm = (arr) => arr.map(toMovie).filter((m) => m && m.id != null);

    const watchedList = norm(watchedIn);
    const watchlistList = norm(watchlistIn);
    const orderList = norm(orderIn);
    const catalogList = norm(catalogIn);

    let added = 0;
    setState((s) => {
      const watched = [...s.watched];
      const watchlist = [...s.watchlist];
      const catalog = [...(s.catalog || [])];

      const upsertWatched = (movie) => {
        const i = watched.findIndex((m) => m.id === movie.id);
        if (i >= 0) watched[i] = { ...watched[i], ...movie };
        else { watched.push(movie); added += 1; }
      };
      const upsertWatchlist = (movie) => {
        const i = watchlist.findIndex((m) => m.id === movie.id);
        if (i >= 0) watchlist[i] = { ...watchlist[i], ...movie };
        else { watchlist.push(movie); added += 1; }
      };

      for (const m of catalogList) {
        if (!catalog.some((c) => c.id === m.id)) catalog.push(m);
      }
      for (const m of watchedList) upsertWatched(m);
      for (const m of watchlistList) upsertWatchlist(m);
      // Ranking order entries are seeded as watched too (so the pool matches).
      for (const m of orderList) {
        if (!watched.some((w) => w.id === m.id)) upsertWatched(m);
      }

      // Seed the engine so the imported order is preserved when possible.
      let rank = s.rank || engine.createState();
      if (orderList.length) {
        const seenIds = new Set(rank.order);
        for (const m of orderList) {
          if (!seenIds.has(m.id)) {
            seenIds.add(m.id);
            rank = { ...rank, order: [...rank.order, m.id] };
          }
        }
        const known = new Set([...watched.map((m) => m.id), ...catalog.map((m) => m.id)]);
        const queue = (rank.queue || []).filter((m) => !seenIds.has(m.id));
        for (const m of watched) {
          if (!seenIds.has(m.id) && known.has(m.id) && !(rank.pending && rank.pending.movie?.id === m.id)) {
            queue.push(m);
          }
        }
        rank = { ...rank, queue };
      }

      return { ...s, watched, watchlist, catalog, rank };
    });
    return added;
  }, []);

  // Back-compat shim (older callers used importWatchedIds).
  const importWatchedIds = useCallback((json) => importData(json), [importData]);

  /** Build a portable export payload (ids + minimal movie metadata). */
  const buildExport = useCallback(() => {
    const slim = (m) => ({
      id: m.id,
      title: m.title || '',
      release_date: m.release_date || '',
      poster_path: m.poster_path || '',
      vote_average: m.vote_average ?? 0,
      genre_ids: m.genre_ids || [],
    });
    const rank = state.rank || engine.createState();
    return {
      app: 'FilmRank',
      version: 1,
      exportedAt: new Date().toISOString(),
      watched: (state.watched || []).map(slim),
      watchlist: (state.watchlist || []).map(slim),
      order: (rank.order || []).map((id) => {
        const m = (state.watched || []).find((x) => x.id === id)
          || (state.catalog || []).find((x) => x.id === id);
        return m ? slim(m) : { id };
      }),
      catalog: (state.catalog || []).map(slim),
    };
  }, [state]);

  const value = useMemo(() => ({
    state,
    catalogStatus,
    catalogError,
    currentMovie,
    movieById,
    loadCatalog,
    // swipe
    markWatched,
    markNotWatched,
    markWatchlist,
    markUnsureSwipe,
    prevCard,
    // lists
    removeFromWatched,
    removeFromWatchlist,
    addToWatchlist,
    moveToWatched,
    // rank
    nextComparison,
    resolveDuel,
    // misc
    resetAll,
    importData,
    importWatchedIds,
    buildExport,
  }), [
    state, catalogStatus, catalogError, currentMovie, movieById, loadCatalog,
    markWatched, markNotWatched, markWatchlist, markUnsureSwipe, prevCard,
    removeFromWatched, removeFromWatchlist, addToWatchlist, moveToWatched,
    nextComparison, resolveDuel, resetAll, importData, importWatchedIds, buildExport,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
