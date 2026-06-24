import React, { useCallback, useEffect, useState } from 'react';
import SplashScreen from './components/SplashScreen';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { TransactionProvider } from './context/TransactionContext';
import { PortfolioProvider } from './context/PortfolioContext';
import BottomNavigation from './components/BottomNavigation';
import { ToastProvider } from './components/ui/Toast';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import AddTransaction from './pages/AddTransaction';
import History from './pages/History';
import Subscriptions from './pages/Subscriptions';
import Settings from './pages/Settings';
import Stats from './pages/Stats';
import ScanReceipt from './pages/ScanReceipt';
import Budgets from './pages/Budgets';
import Goals from './pages/Goals';
import GoalDetail from './pages/GoalDetail';
import { useTranslation } from './i18n/LanguageContext';
import { useTelegramFullscreen } from './hooks/useTelegramFullscreen';
import type { TelegramWindow } from './types/telegram';
import './styles/variables.css';

const BOT_URL = 'https://t.me/netdengabot';

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
      <p style={{ color: '#64748b', fontSize: 13, marginTop: 24 }}>@netdengabot</p>
    </div>
  );
};

const isInsideTelegram = (): boolean => {
  const tgWindow = window as Window & TelegramWindow;
  const tg = tgWindow.Telegram?.WebApp;
  if (!tg) return false;
  if (tg.initData && tg.initData.length > 0) return true;
  const unsafe = tg.initDataUnsafe;
  if (unsafe && unsafe.user && unsafe.user.id) return true;
  return false;
};

const TelegramApp: React.FC<{ onReady: () => void }> = ({ onReady }) => {
  useTelegramFullscreen();

  return (
    <TransactionProvider onReady={onReady}>
      <PortfolioProvider>
        <ToastProvider>
          <Router>
            <div className="app-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/history" element={<History />} />
                <Route path="/subscriptions" element={<Subscriptions />} />
                <Route path="/add" element={<AddTransaction />} />
                <Route path="/scan" element={<ScanReceipt />} />
                <Route path="/stats" element={<Stats />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/budgets" element={<Budgets />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/goals/:id" element={<GoalDetail />} />
              </Routes>
              <BottomNavigation />
            </div>
          </Router>
        </ToastProvider>
      </PortfolioProvider>
    </TransactionProvider>
  );
};

function App() {
  const [isTelegram, setIsTelegram] = useState<boolean | null>(null);
  const [appReady, setAppReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const devBypass = params.get('dev') === '1' || localStorage.getItem('denga_dev') === '1';
    if (devBypass) {
      localStorage.setItem('denga_dev', '1');
      setIsTelegram(true);
      return;
    }

    const tgWindow = window as Window & TelegramWindow;
    const tg = tgWindow.Telegram?.WebApp;
    if (isInsideTelegram()) {
      tg?.expand?.();
      tg?.disableVerticalSwipes?.();
      setIsTelegram(true);
    } else {
      setIsTelegram(false);
    }
  }, []);

  useEffect(() => {
    if (isTelegram === false) {
      setAppReady(true);
    }
  }, [isTelegram]);

  useEffect(() => {
    if (!appReady || isTelegram !== true) return;
    const tgWindow = window as Window & TelegramWindow;
    tgWindow.Telegram?.WebApp?.ready?.();
  }, [appReady, isTelegram]);

  const handleAppReady = useCallback(() => setAppReady(true), []);
  const handleSplashHidden = useCallback(() => setShowSplash(false), []);

  return (
    <>
      {isTelegram === false ? <BrowserStub /> : null}
      {isTelegram === true ? <TelegramApp onReady={handleAppReady} /> : null}
      {showSplash ? (
        <SplashScreen
          isReady={isTelegram !== null && appReady}
          onHidden={handleSplashHidden}
        />
      ) : null}
    </>
  );
}

export default App;
