import { useState } from 'react';
import { useStore } from '../store.jsx';
import { Poster, year } from '../components/Poster.jsx';

export default function WatchlistScreen() {
  const { state, removeFromWatchlist, moveToWatched } = useStore();
  const [open, setOpen] = useState(null);

  if (!state.watchlist.length) {
    return (
      <div className="screen screen--center">
        <div className="empty-state">
          <div className="empty-emoji">🔖</div>
          <h2>Список пуст</h2>
          <p>Свайпай вверх на экране «Свайп», чтобы добавлять фильмы в «хочу посмотреть».</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screen__head">
        <h1>Хочу посмотреть</h1>
        <span className="muted small">{state.watchlist.length} шт.</span>
      </header>
      <ul className="list">
        {state.watchlist.map((m) => (
          <li key={m.id} className="list-item">
            <Poster movie={m} size="sm" />
            <div className="list-item__body" onClick={() => setOpen(open === m.id ? null : m.id)}>
              <div className="list-item__title">{m.title}</div>
              <div className="muted small">{year(m.release_date) || '—'}</div>
            </div>
            <div className="list-item__actions">
              <button className="icon-btn icon-btn--ok" title="Отметить как просмотренный"
                onClick={() => moveToWatched(m.id)}>✓</button>
              <button className="icon-btn icon-btn--danger" title="Удалить"
                onClick={() => removeFromWatchlist(m.id)}>✕</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
