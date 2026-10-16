import { useEffect, useMemo, useState } from 'react';
import { useStore, useDirectors } from '../store.jsx';
import { Poster, year } from '../components/Poster.jsx';
import { fetchGenres, discoverMovies } from '../api/tmdb.js';
import * as engine from '../engine/rank.js';

/** Release year -> decade bucket label, e.g. 1994 -> "1990-е". */
function decadeOf(dateStr) {
  const y = Number((dateStr || '').slice(0, 4));
  if (!y || Number.isNaN(y)) return null;
  return `${Math.floor(y / 10) * 10}-е`;
}

function decadeOrder(label) {
  return Number((label || '').replace(/\D/g, '')) || 0;
}

function Bars({ items, max, colorFrom = 'var(--accent)', colorTo = 'var(--accent-2)', suffix = '' }) {
  if (!items.length) return <p className="muted small">Недостаточно данных.</p>;
  return (
    <div className="taste__bars">
      {items.map((it) => (
        <div key={it.label} className="taste__bar-row">
          <span className="taste__bar-label" title={it.label}>{it.label}</span>
          <div className="taste__bar-track">
            <div
              className="taste__bar-fill"
              style={{
                width: `${Math.max(4, Math.round((it.value / (max || 1)) * 100))}%`,
                background: `linear-gradient(90deg, ${colorFrom}, ${colorTo})`,
              }}
            />
          </div>
          <span className="taste__bar-val">{it.value}{suffix}</span>
        </div>
      ))}
    </div>
  );
}

function Recommendations({ topGenreIds, excludeIds }) {
  const { addToWatchlist, state } = useStore();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(() => new Set());
  useEffect(() => {
    if (!topGenreIds.length) return;
    let cancelled = false;
    setStatus('loading');
    setError(null);
    discoverMovies({ withGenres: topGenreIds.slice(0, 3), exclude: excludeIds, pages: 3, minVotes: 250 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.slice(0, 12));
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Не удалось загрузить рекомендации');
        setStatus('error');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topGenreIds.length ? topGenreIds.join(',') : '', excludeIds.size]);

  const add = (movie) => {
    addToWatchlist(movie);
    setAdded((prev) => new Set(prev).add(movie.id));
  };

  const inWatchlist = (id) => added.has(id) || state.watchlist.some((m) => m.id === id);

  if (status === 'loading') {
    return <div className="row gap"><div className="spinner spinner--sm" /><span className="muted small">Подбираем фильмы…</span></div>;
  }
  if (status === 'error') {
    return <p className="err small">Рекомендации: {error}</p>;
  }
  if (!items.length) {
    return <p className="muted small">Не нашлось фильмов, которые ты ещё не смотрел(а).</p>;
  }

  return (
    <ul className="recs">
      {items.map((m) => (
        <li key={m.id} className="rec-item">
          <Poster movie={m} size="sm" />
          <div className="rec-item__body">
            <div className="rec-item__title">{m.title}</div>
            <div className="muted small">
              {year(m.release_date) || '—'}{m.vote_average ? ` · ★ ${Number(m.vote_average).toFixed(1)}` : ''}
            </div>
          </div>
          <button
            className={inWatchlist(m.id) ? 'btn btn--ghost small' : 'btn btn--primary small'}
            onClick={() => add(m)}
            disabled={inWatchlist(m.id)}
          >
            {inWatchlist(m.id) ? '✓ в списке' : '+ в список'}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function TasteScreen() {
  const { state } = useStore();
  const directors = useDirectors();
  const [genreMap, setGenreMap] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchGenres().then((map) => { if (!cancelled) setGenreMap(map); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const analysis = useMemo(() => {
    const rank = state.rank || engine.createState();
    // rank index of a movie id -> better position = better score (lower index)
    const rankIndex = new Map();
    (rank.order || []).forEach((id, i) => rankIndex.set(id, i));
    const total = rank.order?.length || 0;

    const watched = state.watched || [];

    const genreCount = new Map();   // id -> { count, rankSum, ranked }
    const decadeCount = new Map();
    const directorCount = new Map();

    for (const m of watched) {
      const isRanked = rankIndex.has(m.id);
      const pos = isRanked ? rankIndex.get(m.id) : null;
      for (const gid of m.genre_ids || []) {
        const e = genreCount.get(gid) || { count: 0, rankSum: 0, ranked: 0 };
        e.count += 1;
        if (isRanked && total > 0) { e.rankSum += (pos + 1) / total; e.ranked += 1; }
        genreCount.set(gid, e);
      }
      const dec = decadeOf(m.release_date);
      if (dec) decadeCount.set(dec, (decadeCount.get(dec) || 0) + 1);

      const dirs = directors[m.id];
      if (Array.isArray(dirs)) {
        for (const name of dirs) directorCount.set(name, (directorCount.get(name) || 0) + 1);
      }
    }

    const nameOf = (gid) => (genreMap && genreMap[gid]) || `Жанр ${gid}`;

    const genres = [...genreCount.entries()]
      .map(([gid, e]) => ({
        id: gid,
        label: nameOf(gid),
        value: e.count,
        avgRank: e.ranked ? e.rankSum / e.ranked : null,
      }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

    const decades = [...decadeCount.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => decadeOrder(a.label) - decadeOrder(b.label));

    const tops = [...directorCount.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Top genres by average rank — only genres with at least 2 ranked films.
    const bestByRank = genres
      .filter((g) => g.avgRank != null && g.value >= 2)
      .sort((a, b) => a.avgRank - b.avgRank)
      .slice(0, 6)
      .map((g) => ({ label: g.label, value: Math.round(g.avgRank * 100) }));

    // Ranked-score per genre: lower avg position -> higher score. Used for recs.
    const topGenreIds = genres.slice(0, 3).map((g) => g.id);

    return { genres, decades, tops, bestByRank, topGenreIds, ranked: total, watchedCount: watched.length };
  }, [state.watched, state.rank, directors, genreMap]);

  const excludeIds = useMemo(() => {
    const s = new Set();
    for (const m of state.watched || []) s.add(m.id);
    for (const m of state.watchlist || []) s.add(m.id);
    return s;
  }, [state.watched, state.watchlist]);

  if (!state.watched.length) {
    return (
      <div className="screen screen--center">
        <div className="empty-state">
          <div className="empty-emoji">🎯</div>
          <h2>Пока нет данных</h2>
          <p>Отмечай фильмы как «смотрел» на экране «Свайп» — здесь появится твой вкусовой профиль и рекомендации.</p>
        </div>
      </div>
    );
  }

  const maxGenre = analysis.genres[0]?.value || 1;
  const maxDecade = Math.max(1, ...analysis.decades.map((d) => d.value));
  const maxDir = analysis.tops[0]?.value || 1;
  const maxBest = Math.max(1, ...analysis.bestByRank.map((b) => b.value));

  return (
    <div className="screen taste">
      <header className="screen__head">
        <div>
          <h1>Вкус</h1>
          <span className="muted small">{analysis.watchedCount} фильмов · {analysis.ranked} отранжировано</span>
        </div>
      </header>

      <section className="taste-panel">
        <h2>Любимые жанры</h2>
        <Bars items={analysis.genres.slice(0, 8)} max={maxGenre} />
      </section>

      {analysis.bestByRank.length ? (
        <section className="taste-panel">
          <h2>Топ по средней позиции</h2>
          <p className="muted small" style={{ marginBottom: 8 }}>Чем длиннее — тем выше жанры в твоём топе (средний процентиль позиции).</p>
          <Bars
            items={analysis.bestByRank}
            max={maxBest}
            colorFrom="var(--accent-2)"
            colorTo="#ffd166"
            suffix=""
          />
        </section>
      ) : null}

      <section className="taste-panel">
        <h2>Десятилетия</h2>
        <Bars items={analysis.decades} max={maxDecade} colorFrom="var(--watchlist)" colorTo="#ef476f" />
      </section>

      {analysis.tops.length ? (
        <section className="taste-panel">
          <h2>Режиссёры</h2>
          <Bars items={analysis.tops} max={maxDir} colorFrom="#118ab2" colorTo="var(--accent)" />
        </section>
      ) : (
        <section className="taste-panel">
          <h2>Режиссёры</h2>
          <div className="row gap"><div className="spinner spinner--sm" /><span className="muted small">Подгружаем данные о режиссёрах…</span></div>
        </section>
      )}

      <section className="taste-panel">
        <h2>Рекомендации</h2>
        <p className="muted small" style={{ marginBottom: 8 }}>
          На основе жанров: {analysis.topGenreIds.map((g) => (genreMap && genreMap[g]) || g).join(', ') || '—'}
        </p>
        <Recommendations topGenreIds={analysis.topGenreIds} excludeIds={excludeIds} />
      </section>

      <style>{`
        .taste { gap: 12px; }
        .taste-panel { background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:12px 14px; }
        .taste-panel h2 { font-size:15px; margin-bottom:8px; }
        .taste__bars { display:flex; flex-direction:column; gap:7px; }
        .taste__bar-row { display:grid; grid-template-columns:96px 1fr 40px; align-items:center; gap:8px; }
        .taste__bar-label { font-size:12px; color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .taste__bar-track { height:10px; background:var(--surface-3); border-radius:6px; overflow:hidden; }
        .taste__bar-fill { height:100%; border-radius:6px; transition:width .3s ease; }
        .taste__bar-val { font-size:11.5px; color:var(--text-dim); text-align:right; }
        .recs { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px; }
        .rec-item { display:flex; align-items:center; gap:10px; background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:7px 9px; }
        .rec-item__body { flex:1; min-width:0; }
        .rec-item__title { font-size:13.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .spinner--sm { width:18px; height:18px; border-width:2.5px; }
        .err { color:#ef476f; }
      `}</style>
    </div>
  );
}
