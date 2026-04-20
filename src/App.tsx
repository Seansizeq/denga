import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { TransactionProvider } from './context/TransactionContext';
import BottomNavigation from './components/BottomNavigation';
import Dashboard from './pages/Dashboard';
import AddTransaction from './pages/AddTransaction';
import History from './pages/History';
import './styles/variables.css';

// Placeholder components
const Stats = () => (
  <div style={{ padding: '16px' }}>
    <h1 style={{ fontSize: '34px', fontWeight: 700 }}>Статистика</h1>
    <p style={{ color: '#8E8E93' }}>Діаграми та графіки витрат.</p>
  </div>
);

const Settings = () => (
  <div style={{ padding: '16px' }}>
    <h1 style={{ fontSize: '34px', fontWeight: 700 }}>Налаштування</h1>
    <p style={{ color: '#8E8E93' }}>Налаштування профілю та категорій.</p>
  </div>
);

function App() {
  return (
    <TransactionProvider>
      <Router>
        <div className="app-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/add" element={<AddTransaction />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
          <BottomNavigation />
        </div>
      </Router>
    </TransactionProvider>
  );
}

export default App;
