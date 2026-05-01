import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Target, Car, Plane, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  createGoal,
  getGoals,
  type Goal,
  type GoalCurrency,
} from '../api/client';
import { formatCurrency } from '../utils/formatters';
import type { DisplayCurrency } from '../utils/formatters';
import { useTranslation } from '../i18n/LanguageContext';
import styles from './Goals.module.css';

const SWATCHES = ['#7C5CFF', '#22c55e', '#06b6d4', '#eab308', '#f97316', '#ec4899'] as const;

const ICON_KEYS = ['target', 'car', 'plane', 'shield'] as const;
const ICON_MAP: Record<(typeof ICON_KEYS)[number], LucideIcon> = {
  target: Target,
  car: Car,
  plane: Plane,
  shield: Shield,
};

const GoalIcon: React.FC<{ name: string; color: string; size?: number }> = ({ name, color, size = 22 }) => {
  const key = ICON_KEYS.includes(name as (typeof ICON_KEYS)[number]) ? (name as (typeof ICON_KEYS)[number]) : 'target';
  const Icon = ICON_MAP[key];
  return <Icon size={size} strokeWidth={2} color={color} />;
};

const deadlineDeltaDays = (deadline: string | null): number | null => {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const [y, m, d] = deadline.split('-').map(Number);
  const end = new Date(y, m - 1, d);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
};

const progressPct = (saved: number, target: number): number => {
  if (!target || target <= 0) return 0;
  return Math.min(100, (saved / target) * 100);
};

const fillColorForPct = (pct: number, goalColor: string): string => {
  if (pct >= 100) return '#eab308';
  if (pct >= 50) return '#22c55e';
  return goalColor || '#7C5CFF';
};

const Goals: React.FC = () => {
  const navigate = useNavigate();
  const { t, locale, displayCurrency } = useTranslation();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [currency, setCurrency] = useState<GoalCurrency>(displayCurrency as GoalCurrency);
  const [deadline, setDeadline] = useState('');
  const [color, setColor] = useState<string>(SWATCHES[0]);
  const [iconKey, setIconKey] = useState<(typeof ICON_KEYS)[number]>('target');
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setListError('');
    setLoading(true);
    try {
      const data = await getGoals();
      setGoals(Array.isArray(data) ? data : []);
    } catch {
      setListError(t('goals', 'loadError'));
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setCurrency(displayCurrency as GoalCurrency);
  }, [displayCurrency]);

  const activeGoals = useMemo(() => goals.filter((g) => !g.archived), [goals]);
  const archivedGoals = useMemo(() => goals.filter((g) => g.archived), [goals]);

  const openSheet = () => {
    setSaveError('');
    setName('');
    setTarget('');
    setCurrency(displayCurrency as GoalCurrency);
    setDeadline('');
    setColor(SWATCHES[0]);
    setIconKey('target');
    setSheetOpen(true);
  };

  const onCreate = async () => {
    setSaveError('');
    const n = parseFloat(String(target).replace(',', '.'));
    if (!name.trim() || !Number.isFinite(n) || n <= 0) return;
    try {
      await createGoal({
        name: name.trim(),
        targetAmount: n,
        currency,
        deadline: deadline.trim() || null,
        color,
        icon: iconKey,
      });
      setSheetOpen(false);
      await load();
    } catch {
      setSaveError(t('goals', 'saveError'));
    }
  };

  const renderGoalCard = (g: Goal) => {
    const pct = progressPct(g.saved, g.targetAmount);
    const fill = fillColorForPct(pct, g.color);
    const days = deadlineDeltaDays(g.deadline);
    let deadlineLabel: string | null = null;
    if (days !== null) {
      if (days < 0) deadlineLabel = t('goals', 'overdue');
      else if (days === 0) deadlineLabel = t('goals', 'daysLeft').replace('{n}', '0');
      else deadlineLabel = t('goals', 'daysLeft').replace('{n}', String(days));
    }

    return (
      <button
        key={g.id}
        type="button"
        className={`${styles.goalCard} ${g.archived ? styles.goalCardArchived : ''}`}
        onClick={() => navigate(`/goals/${g.id}`)}
      >
        <div className={styles.goalCardTop}>
          <div className={styles.iconWrap} style={{ backgroundColor: `${g.color}22` }}>
            <GoalIcon name={g.icon} color={g.color} />
          </div>
          <h2 className={styles.goalCardTitle}>{g.name}</h2>
        </div>
        <div className={styles.badgeRow}>
          {pct >= 100 ? <span className={`${styles.badge} ${styles.badgeDone}`}>{t('goals', 'completed')}</span> : null}
          {g.archived ? <span className={styles.badge}>{t('goals', 'archived')}</span> : null}
        </div>
        <div className={styles.amounts}>
          <span className={styles.amountStrong}>
            {formatCurrency(g.saved, locale, g.currency as DisplayCurrency)} /{' '}
            {formatCurrency(g.targetAmount, locale, g.currency as DisplayCurrency)}
          </span>
          <span className={styles.meta}>{Math.round(pct)}%</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${pct}%`, background: fill }} />
        </div>
        {deadlineLabel && g.deadline ? (
          <p className={styles.meta}>
            {t('goals', 'deadline')}: {new Date(g.deadline + 'T12:00:00').toLocaleDateString(locale)} — {deadlineLabel}
          </p>
        ) : null}
      </button>
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate('/')}>
          ← {t('nav', 'home')}
        </button>
        <h1 className={styles.title}>{t('goals', 'title')}</h1>
        <p className={styles.subtitle}>{t('goals', 'subtitle')}</p>
      </header>

      {listError ? (
        <p className={styles.bannerError} role="alert">
          {listError}
        </p>
      ) : null}
      {saveError && sheetOpen ? (
        <p className={styles.bannerError} role="alert">
          {saveError}
        </p>
      ) : null}

      {loading ? (
        <p className={styles.emptyText}>{t('planner', 'loading')}</p>
      ) : goals.length === 0 ? (
        <p className={styles.emptyText}>{t('goals', 'empty')}</p>
      ) : (
        <>
          {activeGoals.length > 0 ? <div className={styles.list}>{activeGoals.map(renderGoalCard)}</div> : null}
          {archivedGoals.length > 0 ? (
            <>
              <h3 className={styles.sectionTitle}>{t('goals', 'archived')}</h3>
              <div className={styles.list}>{archivedGoals.map(renderGoalCard)}</div>
            </>
          ) : null}
        </>
      )}

      <button type="button" className={styles.fab} aria-label={t('goals', 'addGoal')} onClick={openSheet}>
        <Plus size={28} strokeWidth={2} />
      </button>

      {sheetOpen ? (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSheetOpen(false);
          }}
        >
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.sheetTitle}>{t('goals', 'addGoal')}</h2>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="goal-name">
                {t('goals', 'name')}
              </label>
              <input
                id="goal-name"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('goals', 'name')}
              />
            </div>
            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="goal-target">
                  {t('goals', 'target')}
                </label>
                <input
                  id="goal-target"
                  className={styles.input}
                  inputMode="decimal"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="goal-cur">
                  {t('goals', 'currency')}
                </label>
                <select
                  id="goal-cur"
                  className={styles.input}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as GoalCurrency)}
                >
                  <option value="UAH">UAH</option>
                  <option value="PLN">PLN</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="goal-deadline">
                {t('goals', 'deadline')} ({t('goals', 'deadlineOptional')})
              </label>
              <input
                id="goal-deadline"
                className={styles.input}
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>{t('goals', 'color')}</span>
              <div className={styles.swatches}>
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`${styles.swatch} ${color === c ? styles.swatchActive : ''}`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>{t('addTx', 'chooseIcon')}</span>
              <div className={styles.swatches}>
                {ICON_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`${styles.swatch} ${iconKey === k ? styles.swatchActive : ''}`}
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                    onClick={() => setIconKey(k)}
                    aria-label={k}
                  >
                    <GoalIcon name={k} color={color} size={18} />
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.sheetActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setSheetOpen(false)}>
                {t('goals', 'cancel')}
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => void onCreate()}>
                {t('goals', 'save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Goals;
