import { useStore } from '../store.jsx';
import { Poster, year } from '../components/Poster.jsx';
import * as engine from '../engine/rank.js';

export default function RankScreen() {
  const { state, nextComparison, resolveDuel } = useStore();
  const rank = state.rank || engine.createState();

  const watchedCount = state.watched.length;
  const rankedCount = rank.order.length;
  const pending = engine.pendingCount(rank);

  if (watchedCount < 2) {
    return (
      <div className="screen screen--center">
        <div className="empty-state">
          <div className="empty-emoji">⚔️</div>
          <h2>Мало фильмов</h2>
          <p>Нужно минимум 2 просмотренных фильма, чтобы начать дуэли. Сейчас: {watchedCount}.</p>
        </div>
      </div>
    );
  }

  if (!nextComparison) {
    return (
      <div className="screen screen--center">
        <div className="empty-state">
          <div className="empty-emoji">🏆</div>
          <h2>Всё отсортировано!</h2>
          <p>Отранжировано {rankedCount} из {watchedCount}. Смотри результат во вкладке «Рейтинг».</p>
        </div>
      </div>
    );
  }

  const { movie, anchor, remaining, progress } = nextComparison;

  return (
    <div className="screen duel">
      <header className="duel__head">
        <h1>Что лучше?</h1>
        <span className="muted small">осталось сравнений: {pending} · ~{remaining} тапов</span>
      </header>

      <div className="duel__progress">
        <div className="progress">
          <div className="progress__bar" style={{ width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%` }} />
        </div>
        <span className="muted small">Позиция в списке: #{Math.min(anchorRankIndex(rank, anchor.id) + 1, rank.order.length)} из {rank.order.length}</span>
      </div>

      <div className="duel__grid">
        <button className="duel-card duel-card--a" onClick={() => resolveDuel('a')}>
          <div className="duel-card__tag">НОВЫЙ</div>
          <Poster movie={movie} size="lg" />
          <div className="duel-card__title">{movie.title}</div>
          <div className="muted small">{year(movie.release_date) || '—'}</div>
          <div className="duel-card__pick">A — лучше</div>
        </button>

        <div className="duel__vs">VS</div>

        <button className="duel-card duel-card--b" onClick={() => resolveDuel('b')}>
          <div className="duel-card__tag duel-card__tag--alt">В СПИСКЕ</div>
          <Poster movie={anchor} size="lg" />
          <div className="duel-card__title">{anchor.title}</div>
          <div className="muted small">{year(anchor.release_date) || '—'}</div>
          <div className="duel-card__pick">B — лучше</div>
        </button>
      </div>

      <div className="duel__actions">
        <button className="btn btn--a" onClick={() => resolveDuel('a')}>A лучше</button>
        <button className="btn" onClick={() => resolveDuel('tie')}>Равны</button>
        <button className="btn btn--ghost" onClick={() => resolveDuel('unsure')}>Не помню</button>
        <button className="btn btn--b" onClick={() => resolveDuel('b')}>B лучше</button>
      </div>
    </div>
  );
}

function anchorRankIndex(rank, id) {
  const i = rank.order.indexOf(id);
  return i < 0 ? 0 : i;
}
