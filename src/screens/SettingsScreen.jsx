import { useRef, useState } from 'react';
import { useStore } from '../store.jsx';

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportPanel() {
  const { importData } = useStore();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  const flash = (ok, t) => {
    setMsg({ ok, text: t });
    setTimeout(() => setMsg(null), 3000);
  };

  const runImport = (raw) => {
    try {
      importData(raw || '[]');
      flash(true, 'Импортировано и объединено с текущими данными!');
      setText('');
    } catch (e) {
      flash(false, 'Некорректный JSON: ' + (e?.message || ''));
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importData(String(reader.result));
        flash(true, 'Файл импортирован!');
      } catch (err) {
        flash(false, 'Ошибка файла: ' + (err?.message || ''));
      }
    };
    reader.onerror = () => flash(false, 'Не удалось прочитать файл');
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section className="settings card-panel">
      <h2>Импорт</h2>
      <p className="muted small">
        Вставь JSON (полный экспорт, <code>{'{"watched":[...],"watchlist":[...],"order":[...]}'}</code> или просто массив id).
        Данные объединяются с текущими.
      </p>
      <textarea
        className="input"
        rows={3}
        placeholder='{"watched":[{"id":603}],"watchlist":[],"order":[]}'
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row gap wrap">
        <button className="btn btn--primary small" onClick={() => runImport(text)}>Импорт из текста</button>
        <label className="btn small file-btn">
          Загрузить .json
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} hidden />
        </label>
      </div>
      {msg ? <p className={msg.ok ? 'ok small' : 'err small'}>{msg.text}</p> : null}
    </section>
  );
}

export default function SettingsScreen() {
  const { state, resetAll, loadCatalog, buildExport } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [exported, setExported] = useState(false);

  const doExport = () => {
    const payload = buildExport();
    const stamp = new Date().toISOString().slice(0, 10);
    download(`filmrank-export-${stamp}.json`, JSON.stringify(payload, null, 2));
    setExported(true);
    setTimeout(() => setExported(false), 2500);
  };

  return (
    <div className="screen">
      <header className="screen__head">
        <h1>Настройки</h1>
      </header>

      <section className="card-panel stat-grid">
        <div className="stat"><span className="stat__num">{state.catalog.length}</span><span className="muted small">в каталоге</span></div>
        <div className="stat"><span className="stat__num">{state.watched.length}</span><span className="muted small">просмотрено</span></div>
        <div className="stat"><span className="stat__num">{state.watchlist.length}</span><span className="muted small">в списке</span></div>
        <div className="stat"><span className="stat__num">{state.rank?.order?.length || 0}</span><span className="muted small">ранжировано</span></div>
      </section>

      <section className="card-panel">
        <h2>Экспорт</h2>
        <p className="muted small">Скачать JSON: просмотренные, список и порядок рейтинга (id + минимальные данные).</p>
        <div className="row gap wrap">
          <button className="btn btn--primary small" onClick={doExport}>
            {exported ? '✓ Файл скачан' : '⤓ Экспорт JSON'}
          </button>
        </div>
      </section>

      <ImportPanel />

      <section className="card-panel">
        <h2>Данные</h2>
        <p className="muted small">Всё хранится локально в браузере (localStorage). Ничего не отправляется на сервер.</p>
        <div className="row gap wrap">
          <button className="btn small" onClick={() => loadCatalog(true)}>Обновить каталог TMDB</button>
          {!confirm ? (
            <button className="btn btn--danger small" onClick={() => setConfirm(true)}>Сбросить всё</button>
          ) : (
            <>
              <button className="btn btn--danger small" onClick={() => { resetAll(); setConfirm(false); }}>Точно сбросить</button>
              <button className="btn btn--ghost small" onClick={() => setConfirm(false)}>Отмена</button>
            </>
          )}
        </div>
      </section>

      <style>{`
        .card-panel { background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:14px; margin-top:12px; }
        .card-panel h2 { font-size:15px; margin:0 0 6px; }
        .input { width:100%; box-sizing:border-box; background:var(--surface-1); color:var(--text); border:1px solid var(--border); border-radius:8px; padding:8px; font-family:var(--mono); font-size:12px; resize:vertical; margin-bottom:8px; }
        .file-btn { cursor:pointer; }
        .row.wrap { flex-wrap:wrap; }
        .ok { color:#06d6a0; } .err { color:#ef476f; }
        .stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:0; }
        .stat { display:flex; flex-direction:column; align-items:center; gap:2px; }
        .stat__num { font-size:22px; font-weight:700; color:var(--text); }
        @media (max-width:420px){ .stat-grid{ grid-template-columns:repeat(2,1fr);} }
      `}</style>
    </div>
  );
}
