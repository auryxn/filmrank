import axios from 'axios';

const KEY = import.meta.env.VITE_TMDB_KEY;
const BASE = 'https://api.themoviedb.org/3';

const api = axios.create({
  baseURL: BASE,
  params: { api_key: KEY },
  timeout: 15000,
});

export const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';

export function posterUrl(path) {
  return path ? `${POSTER_BASE}${path}` : '';
}

/** Fetch a genre id -> name map (cached in-module). */
let genreCache = null;
export async function fetchGenres() {
  if (genreCache) return genreCache;
  const { data } = await api.get('/genre/movie/list');
  genreCache = {};
  for (const g of data.genres || []) genreCache[g.id] = g.name;
  return genreCache;
}

export function genreNames(ids, map) {
  if (!ids || !map) return [];
  return ids.map((id) => map[id]).filter(Boolean);
}

/**
 * Fetch a single movie's credits and return its director(s).
 * Tolerates failures (returns [] on any error / missing data).
 */
export async function fetchDirectors(id) {
  if (id == null) return [];
  try {
    const { data } = await api.get(`/movie/${id}/credits`);
    const crew = data?.crew || [];
    return crew.filter((c) => c.job === 'Director').map((c) => c.name).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Discover movies for recommendations.
 * @param {{ withGenres?: number[]|string, exclude?: Set<number>, sortBy?: string, minVotes?: number }} opts
 */
export async function discoverMovies({ withGenres, exclude, sortBy = 'vote_average.desc', minVotes = 300, pages = 2 } = {}) {
  if (!KEY) throw new Error('Missing VITE_TMDB_KEY');
  const genres = Array.isArray(withGenres) ? withGenres.join(',') : withGenres;
  const requests = [];
  for (let page = 1; page <= pages; page++) {
    requests.push(
      api.get('/discover/movie', {
        params: {
          page,
          sort_by: sortBy,
          with_genres: genres || undefined,
          'vote_count.gte': minVotes,
        },
      }).catch(() => null),
    );
  }
  const settled = await Promise.allSettled(requests);
  const out = [];
  const seen = new Set();
  for (const s of settled) {
    if (s.status !== 'fulfilled' || !s.value) continue;
    for (const r of s.value.data?.results || []) {
      if (!r?.poster_path) continue;
      if (exclude && exclude.has(r.id)) continue;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(normalize(r));
    }
  }
  return out;
}

function normalize(r) {
  return {
    id: r.id,
    title: r.title || r.name || r.original_title || 'Untitled',
    release_date: r.release_date || r.first_air_date || '',
    overview: r.overview || '',
    poster_path: r.poster_path || '',
    vote_average: r.vote_average ?? 0,
    genre_ids: r.genre_ids || [],
  };
}

const PAGE_ENDPOINTS = [
  (page) => api.get('/movie/popular', { params: { page } }),
  (page) => api.get('/movie/top_rated', { params: { page } }),
  (page) => api.get('/discover/movie', { params: { page, sort_by: 'vote_count.desc', 'vote_count.gte': 500 } }),
  (page) => api.get('/discover/movie', { params: { page, sort_by: 'popularity.desc' } }),
];

/**
 * Build a mixed catalog of ~60-100 movies by pulling a few pages across
 * several TMDB endpoints, de-duplicated by id.
 */
export async function fetchCatalog(target = 90) {
  if (!KEY) throw new Error('Missing VITE_TMDB_KEY');

  const requests = [];
  // 3 pages from each of 4 endpoints ~= up to 240 raw results; trimmed below.
  for (const endpoint of PAGE_ENDPOINTS) {
    for (let page = 1; page <= 3; page++) {
      requests.push(endpoint(page).catch(() => null));
    }
  }

  const settled = await Promise.allSettled(requests);
  const seen = new Set();
  const out = [];
  const buckets = [];

  for (const s of settled) {
    if (s.status !== 'fulfilled' || !s.value) continue;
    const results = (s.value.data?.results || []).map(normalize);
    buckets.push(results);
  }

  // Interleave buckets so the catalog mixes popular/top-rated/discover.
  let i = 0;
  let added = true;
  while (out.length < target && added) {
    added = false;
    for (const bucket of buckets) {
      const item = bucket[i];
      if (!item) continue;
      added = true;
      if (seen.has(item.id)) continue;
      // Skip items without a poster (bad card UX).
      if (!item.poster_path) continue;
      seen.add(item.id);
      out.push(item);
      if (out.length >= target) break;
    }
    i++;
    if (i > 60) break;
  }

  if (!out.length) throw new Error('TMDB returned no movies');
  return out;
}
