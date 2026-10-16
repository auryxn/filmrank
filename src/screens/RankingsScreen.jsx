import { useState } from 'react';
import { useStore } from '../store.jsx';
import { Poster, year } from '../components/Poster.jsx';
import * as engine from '../engine/rank.js';
import { ImportPanel } from './SettingsScreen.jsx';

const TIER_COLORS = {
  S: '#ffd166',
  A: '#ef476f',
  B: '#06d6a0',
  C: '#118ab2',
  D: '#8f7fe8',
  F: '#6b7280',
};

export default function RankingsScreen() {
  const { state, movieById } = useStore();
  const [view, setView] = useState('list'); // list | tiers
  const [copied, setCopied] = useState(false);

  const rank = state.rank || engine.createState();
  const lookup = (id) => state.watched.find((m) => m.id === id) || movieById(id) || { id, title: `Movie #${id}` };
  const list = engine.orderedMovies(rank, lookup);
  const rankedCount = list.length;
  const watchlistOfInsertion = engine.pendingCount(rank);

  const exportText = () => engine.rankText(rank, lookup, 0);

  const copyRanking = async () => {
    const text = `Мой топ фильмов (FilmRank)\n\n${exportText()}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const shareRanking = async () => {
    const text = `Мой топ фильмов (FilmRank)\n\n${exportText()}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'FilmRank — мой топ', text });
        return;
      } catch {
        /* user cancelled */
      }
    }
    copyRanking();
  };

  if (!rankedCount) {
    return (
      <div className="screen screen--center">
        <div className="empty-state">
          <div className="empty-emoji">📊</div>
          <h2>Рейтинг пуст</h2>
          <p>Отмечай фильмы как «смотрел» и проходи дуэли — здесь появится твой топ.</p>
        </div>
      </div>
    );
  }

  const buckets = engine.tierBuckets(rank, lookup);

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1>Рейтинг</h1>
          <span className="muted small">
            {rankedCount} в списке{watchlistOfInsertion ? ` · ${watchlistOfInsertion} в очереди` : ''}
          </span>
        </div>
        <div className="seg">
          <button className={view === 'list' ? 'seg__btn active' : 'seg__btn'} onClick={() => setView('list')}>Список</button>
          <button className={view === 'tiers' ? 'seg__btn active' : 'seg__btn'} onClick={() => setView('tiers')}>Тиры</button>
        </div>
      </header>

      <div className="rankings__toolbar">
        <button className="btn btn--primary small" onClick={copyRanking}>{copied ? '✓ Скопировано' : '⧉ Копировать топ'}</button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button className="btn small" onClick={shareRanking}>↗ Поделиться</button>
        )}
      </div>

      {view === 'list' ? (
        <ol className="list rankings__list">
          {list.map((m, i) => (
            <li key={m.id} className="list-item">
              <span className="rank-badge">{i + 1}</span>
              <Poster movie={m} size="sm" />
              <div className="list-item__body">
                <div className="list-item__title">{m.title}</div>
                <div className="muted small">{year(m.release_date) || '—'}</div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="tiers">
          {engine.TIERS.map((tier) => (
            <div key={tier} className="tier-row">
              <div className="tier-label" style={{ background: TIER_COLORS[tier] }}>{tier}</div>
              <div className="tier-items">
                {buckets[tier].length ? buckets[tier].map(({ rank: r, movie }) => (
                  <div key={movie.id} className="tier-chip" title={`#${r} ${movie.title}`}>
                    <Poster movie={movie} size="xs" />
                    <span className="tier-chip__title">{movie.title}</span>
                  </div>
                )) : <span className="muted small tier-empty">пусто</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <ImportPanel />

      <style>{`
        .seg { display:inline-flex; background:var(--surface-2); border-radius:10px; padding:3px; gap:2px; }
        .seg__btn { border:0; background:transparent; color:var(--text-dim); padding:6px 12px; border-radius:8px; font:inherit; font-size:13px; cursor:pointer; }
        .seg__btn.active { background:var(--surface-3); color:var(--text); }
        .rankings__toolbar { display:flex; gap:8px; margin:12px 0; }
        .rankings__list { list-style:none; padding:0; margin:0; }
        .rank-badge { min-width:26px; height:26px; display:grid; place-items:center; border-radius:8px; background:var(--surface-3); font-size:13px; font-weight:600; color:var(--text); }
        .tiers { display:flex; flex-direction:column; gap:10px; margin-top:8px; }
        .tier-row { display:flex; gap:10px; align-items:stretch; background:var(--surface-2); border-radius:12px; padding:8px; }
        .tier-label { min-width:38px; border-radius:8px; display:grid; place-items:center; font-weight:800; font-size:20px; color:#111; }
        .tier-items { display:flex; flex-wrap:wrap; gap:8px; flex:1; align-items:center; }
        .tier-chip { display:flex; flex-direction:column; width:64px; align-items:center; gap:4px; }
        .tier-chip__title { font-size:10px; line-height:1.15; text-align:center; color:var(--text-dim); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .tier-empty { padding:12px; }
      `}</style>
    </div>
  );
}
