import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { TransactionProvider } from './context/TransactionContext';
import BottomNavigation from './components/BottomNavigation';
import Dashboard from './pages/Dashboard';
import AddTransaction from './pages/AddTransaction';
import History from './pages/History';
import CalendarPlanner from './pages/CalendarPlanner';
import Subscriptions from './pages/Subscriptions';
import Settings from './pages/Settings';
import { useTranslation } from './i18n/LanguageContext';
import { useTelegramFullscreen } from './hooks/useTelegramFullscreen';
import './styles/variables.css';

const BOT_URL = 'https://t.me/denga_bot';

const BrowserStub = () => {
  const { t } = useTranslation();
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      textAlign: 'center',
      background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        width: 96,
        height: 96,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #2AABEE 0%, #229ED9 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
        boxShadow: '0 12px 32px rgba(42, 171, 238, 0.35)'
      }}>
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.11-3.04-1.98 1.93c-.23.23-.42.42-.86.42z" fill="#fff"/>
        </svg>
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 12px' }}>{t('stub', 'title')}</h1>
      <p style={{ color: '#94a3b8', fontSize: 16, lineHeight: 1.5, maxWidth: 340, margin: '0 0 32px' }}>
        {t('stub', 'description')}
      </p>
      <a
        href={BOT_URL}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '14px 28px',
          background: '#2AABEE',
          color: '#fff',
          textDecoration: 'none',
          borderRadius: 12,
          fontWeight: 600,
          fontSize: 16,
          boxShadow: '0 8px 24px rgba(42, 171, 238, 0.35)'
        }}
      >
        {t('stub', 'openButton')}
      </a>
      <p style={{ color: '#64748b', fontSize: 13, marginTop: 24 }}>@denga_bot</p>
    </div>
  );
};

const isInsideTelegram = (): boolean => {
  const tg = (window as any).Telegram?.WebApp;
  if (!tg) return false;
  if (tg.initData && tg.initData.length > 0) return true;
  const unsafe = tg.initDataUnsafe;
  if (unsafe && unsafe.user && unsafe.user.id) return true;
  return false;
};

const TelegramApp: React.FC = () => {
  useTelegramFullscreen();

  return (
    <TransactionProvider>
      <Router>
        <div className="app-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/calendar" element={<CalendarPlanner />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/add" element={<AddTransaction />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
          <BottomNavigation />
        </div>
      </Router>
    </TransactionProvider>
  );
};

function App() {
  const [isTelegram, setIsTelegram] = useState<boolean | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const devBypass = params.get('dev') === '1' || localStorage.getItem('denga_dev') === '1';
    if (devBypass) {
      localStorage.setItem('denga_dev', '1');
      setIsTelegram(true);
      return;
    }

    const tg = (window as any).Telegram?.WebApp;
    if (isInsideTelegram()) {
      tg.expand();
      tg.ready();
      tg.disableVerticalSwipes?.();
      setIsTelegram(true);
    } else {
      setIsTelegram(false);
    }
  }, []);

  if (isTelegram === null) {
    return null;
  }

  if (!isTelegram) {
    return <BrowserStub />;
  }

  return <TelegramApp />;
}

export default App;
