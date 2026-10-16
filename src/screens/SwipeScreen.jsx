import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Poster, year } from '../components/Poster.jsx';
import { useStore } from '../store.jsx';

const SWIPE_THRESHOLD = 110;
const FLY_MS = 280;

/**
 * A single swipe card. Owns its OWN fresh motion values so that every new card
 * (rendered under `key={movie.id}`) always mounts at x=0, y=0 with no rotation.
 * Any in-flight fly-out animation is stopped on unmount so the flying card can
 * never write its offset back onto the next card.
 *
 * `onDecide(dir)` is called once the fly-out finishes (or immediately for a
 * button-press decision) with 'left' | 'right' | 'up'.
 */
function SwipeCard({ movie, onDecide, onDragStateChange }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-250, 250], [-14, 14]);
  const likeOpacity = useTransform(x, [40, 160], [0, 1]);     // right = не смотрел
  const nopeOpacity = useTransform(x, [-160, -40], [1, 0]);   // left  = смотрел
  const upOpacity = useTransform(y, [-40, -140], [0, 1]);     // up    = в список

  const controlsRef = useRef([]);
  const busyRef = useRef(false);

  // Stop every in-flight animation when this card unmounts (card change /
  // screen change) so a stale animation cannot leak onto the next card.
  useEffect(() => {
    return () => {
      for (const c of controlsRef.current) {
        try { c?.stop(); } catch { /* noop */ }
      }
      controlsRef.current = [];
    };
  }, []);

  const fly = useCallback((dir) => {
    if (busyRef.current) return;
    busyRef.current = true;
    onDragStateChange?.(true);

    const targets = {
      left: { x: -520, y: 40 },
      right: { x: 520, y: 40 },
      up: { x: 0, y: -640 },
    }[dir] || { x: 0, y: 0 };

    controlsRef.current = [
      animate(x, targets.x, { duration: FLY_MS / 1000, ease: 'easeOut' }),
      animate(y, targets.y, { duration: FLY_MS / 1000, ease: 'easeOut' }),
    ];

    window.setTimeout(() => {
      onDecide(dir);
    }, FLY_MS - 60);
  }, [x, y, onDecide, onDragStateChange]);

  const onDragEnd = (_e, info) => {
    const { offset } = info;
    if (Math.abs(offset.x) < SWIPE_THRESHOLD && Math.abs(offset.y) < SWIPE_THRESHOLD) {
      controlsRef.current = [
        animate(x, 0, { type: 'spring', stiffness: 320, damping: 26 }),
        animate(y, 0, { type: 'spring', stiffness: 320, damping: 26 }),
      ];
      return;
    }
    if (Math.abs(offset.x) > Math.abs(offset.y)) {
      fly(offset.x < 0 ? 'left' : 'right');
    } else if (offset.y < 0) {
      fly('up');
    } else {
      controlsRef.current = [
        animate(x, 0, { type: 'spring', stiffness: 320, damping: 26 }),
        animate(y, 0, { type: 'spring', stiffness: 320, damping: 26 }),
      ];
    }
  };

  return (
    <motion.div
      className="card"
      data-testid="swipe-card"
      style={{ x, y, rotate }}
      initial={false}
      drag
      dragElastic={0.6}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragEnd={onDragEnd}
      whileTap={{ cursor: 'grabbing' }}
    >
      <div className="card__poster">
        <Poster movie={movie} size="lg" />
      </div>

      <motion.div className="badge badge--watched" data-testid="badge-watched" style={{ opacity: nopeOpacity }}>СМОТРЕЛ</motion.div>
      <motion.div className="badge badge--not" data-testid="badge-not" style={{ opacity: likeOpacity }}>НЕ СМОТРЕЛ</motion.div>
      <motion.div className="badge badge--up" data-testid="badge-up" style={{ opacity: upOpacity }}>В СПИСОК</motion.div>

      <div className="card__info">
        <h2 className="card__title">{movie.title}</h2>
        <div className="card__meta">
          <span>{year(movie.release_date) || '—'}</span>
          {movie.vote_average ? <span>★ {Number(movie.vote_average).toFixed(1)}</span> : null}
        </div>
        {movie.overview ? (
          <p className="card__overview">{movie.overview}</p>
        ) : null}
      </div>
    </motion.div>
  );
}

export default function SwipeScreen() {
  const {
    currentMovie,
    catalogStatus,
    catalogError,
    loadCatalog,
    markWatched,
    markNotWatched,
    markWatchlist,
    markUnsureSwipe,
    prevCard,
    state,
  } = useStore();

  // `busy` disables the action buttons while a card is flying out.
  const [busy, setBusy] = useState(false);
  // Bumped on every decision so the card element remounts fresh (keyed).
  const lastIdRef = useRef(currentMovie?.id);

  useEffect(() => {
    if (lastIdRef.current !== currentMovie?.id) {
      lastIdRef.current = currentMovie?.id;
      setBusy(false);
    }
  }, [currentMovie?.id]);

  const decide = useCallback((dir, movie) => {
    if (!movie) return;
    if (dir === 'left') markWatched(movie);
    else if (dir === 'right') markNotWatched(movie);
    else if (dir === 'up') markWatchlist(movie);
  }, [markWatched, markNotWatched, markWatchlist]);

  const progress = state.catalog.length
    ? Math.round((state.catalogIndex / state.catalog.length) * 100)
    : 0;

  if (catalogStatus === 'error') {
    return (
      <div className="screen screen--center">
        <div className="empty-state">
          <div className="empty-emoji">📡</div>
          <h2>Ошибка загрузки</h2>
          <p>{catalogError}</p>
          <button className="btn btn--primary" onClick={() => loadCatalog(true)}>Повторить</button>
        </div>
      </div>
    );
  }

  if (catalogStatus === 'loading' && !currentMovie) {
    return (
      <div className="screen screen--center">
        <div className="spinner" />
        <p className="muted">Загружаем фильмы…</p>
      </div>
    );
  }

  if (!currentMovie) {
    return (
      <div className="screen screen--center">
        <div className="empty-state">
          <div className="empty-emoji">🎬</div>
          <h2>Каталог пройден</h2>
          <p>Ты просмотрел все карточки ({state.catalog.length}).</p>
          <div className="row gap">
            <button className="btn" onClick={prevCard} disabled={state.catalogIndex === 0}>← Назад</button>
            <button className="btn btn--primary" onClick={() => loadCatalog(true)}>Новые фильмы</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen swipe">
      <div className="swipe__head">
        <span className="muted small">{state.catalogIndex + 1} / {state.catalog.length}</span>
        <div className="progress"><div className="progress__bar" style={{ width: `${progress}%` }} /></div>
      </div>

      <div className="deck">
        <div className="card-ghost card-ghost--1" />
        <div className="card-ghost card-ghost--2" />
        <SwipeCard
          key={currentMovie.id}
          movie={currentMovie}
          onDragStateChange={setBusy}
          onDecide={(dir) => decide(dir, currentMovie)}
        />
      </div>

      <motion.div className="hint hint--up" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2 }}>↑ хочу посмотреть</motion.div>

      <div className="swipe__actions">
        <button className="circle circle--watched" data-testid="btn-watched"
          onClick={() => decide('left', currentMovie)} disabled={busy} title="Смотрел">
          ✓<span>смотрел</span>
        </button>
        <button className="pill pill--unsure" onClick={() => { markUnsureSwipe(currentMovie); }} disabled={busy}>
          не помню
        </button>
        <button className="circle circle--list" data-testid="btn-list"
          onClick={() => decide('up', currentMovie)} disabled={busy} title="Хочу посмотреть">
          ＋<span>в список</span>
        </button>
        <button className="circle circle--not" data-testid="btn-not"
          onClick={() => decide('right', currentMovie)} disabled={busy} title="Не смотрел">
          ✕<span>не смотрел</span>
        </button>
      </div>

      <div className="swipe__foot">
        <button className="btn btn--ghost small" onClick={prevCard} disabled={state.catalogIndex === 0}>← Назад</button>
        <button className="btn btn--ghost small" onClick={() => loadCatalog(true)}>Обновить каталог</button>
      </div>
    </div>
  );
}
