import { posterUrl } from '../api/tmdb.js';

export function year(dateStr) {
  return (dateStr || '').slice(0, 4);
}

export function Poster({ movie, size = 'md', className = '' }) {
  const url = movie?.poster_path ? posterUrl(movie.poster_path) : '';
  const cls = `poster poster--${size} ${className}`.trim();
  if (!url) {
    return (
      <div className={`${cls} poster--empty`}>
        <span>{movie?.title?.slice(0, 1) || '?'}</span>
      </div>
    );
  }
  return <img className={cls} src={url} alt={movie?.title || ''} loading="lazy" draggable={false} />;
}
