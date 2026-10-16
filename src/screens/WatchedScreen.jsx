import { useStore } from '../store.jsx';
import { Poster, year } from '../components/Poster.jsx';

export default function WatchedScreen() {
  const { state, removeFromWatched } = useStore();

  if (!state.watched.length) {
    return (
      <div className="screen screen--center">
        <div className="empty-state">
          <div className="empty-emoji">📺</div>
          <h2>Пока ничего</h2>
          <p>Свайп влево = «смотрел» — такие фильмы попадают в пул для ранжирования.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screen__head">
        <h1>Просмотрено</h1>
        <span className="muted small">{state.watched.length} шт.</span>
      </header>
      <ul className="list">
        {state.watched.map((m) => (
          <li key={m.id} className="list-item">
            <Poster movie={m} size="sm" />
            <div className="list-item__body">
              <div className="list-item__title">{m.title}</div>
              <div className="muted small">{year(m.release_date) || '—'}</div>
            </div>
            <div className="list-item__actions">
              <button className="icon-btn icon-btn--danger" title="Убрать"
                onClick={() => removeFromWatched(m.id)}>✕</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
