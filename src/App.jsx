import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { StoreProvider, useStore } from './store.jsx';
import SwipeScreen from './screens/SwipeScreen.jsx';
import WatchlistScreen from './screens/WatchlistScreen.jsx';
import WatchedScreen from './screens/WatchedScreen.jsx';
import RankScreen from './screens/RankScreen.jsx';
import RankingsScreen from './screens/RankingsScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import TasteScreen from './screens/TasteScreen.jsx';
import * as engine from './engine/rank.js';

const TABS = [
  { id: 'swipe', label: 'Свайп', icon: '🔥' },
  { id: 'watchlist', label: 'Список', icon: '🔖' },
  { id: 'watched', label: 'Смотрено', icon: '📺' },
  { id: 'rank', label: 'Дуэли', icon: '⚔️' },
  { id: 'rankings', label: 'Рейтинг', icon: '🏆' },
  { id: 'taste', label: 'Вкус', icon: '🎯' },
];

function Shell() {
  const [tab, setTab] = useState('swipe');
  const { state } = useStore();

  const pendingDuels = state.rank ? engine.pendingCount(state.rank) : 0;

  const render = () => {
    switch (tab) {
      case 'watchlist': return <WatchlistScreen />;
      case 'watched': return <WatchedScreen />;
      case 'rank': return <RankScreen />;
      case 'rankings': return <RankingsScreen />;
      case 'taste': return <TasteScreen />;
      case 'settings': return <SettingsScreen />;
      case 'swipe':
      default: return <SwipeScreen />;
    }
  };

  return (
    <div className="app">
      <header className="app__bar">
        <div className="brand"><span className="brand__logo">🎞️</span> FilmRank</div>
        <button className="icon-btn" title="Настройки" onClick={() => setTab(tab === 'settings' ? 'swipe' : 'settings')}>
          {tab === 'settings' ? '✕' : '⚙'}
        </button>
      </header>

      <main className="app__main">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
          >
            {render()}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
          >
            <span className="tab__icon">{t.icon}</span>
            <span className="tab__label">{t.label}</span>
            {t.id === 'rank' && pendingDuels > 0 ? <span className="tab__dot">{pendingDuels > 99 ? '99+' : pendingDuels}</span> : null}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
