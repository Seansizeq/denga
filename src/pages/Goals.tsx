import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Target, Car, Plane, Shield, Home, Briefcase, Wallet, Heart, Gift } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  createGoal,
  getGoals,
  type Goal,
  type GoalCurrency,
  type GoalType,
} from '../api/client';
import { formatCurrency } from '../utils/formatters';
import type { DisplayCurrency } from '../utils/formatters';
import { useTranslation } from '../i18n/LanguageContext';
import { useGoBack } from '../hooks/useGoBack';
import FormSheet from '../components/ui/FormSheet';
import sheet from '../components/ui/FormSheet.module.css';
import styles from './Goals.module.css';

const SWATCHES = ['#7C5CFF', '#22c55e', '#06b6d4', '#eab308', '#f97316', '#ec4899'] as const;

const ICON_KEYS = ['target', 'car', 'plane', 'shield', 'home', 'briefcase', 'wallet', 'heart', 'gift'] as const;
const ICON_MAP: Record<(typeof ICON_KEYS)[number], LucideIcon> = {
  target: Target,
  car: Car,
  plane: Plane,
  shield: Shield,
  home: Home,
  briefcase: Briefcase,
  wallet: Wallet,
  heart: Heart,
  gift: Gift,
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

/** Локальна «сьогодні» — щоб дата-пікер не відсікав поточний день у чужому часовому поясі. */
const todayIso = (): string => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
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
  const goBack = useGoBack('/');
  const { t, locale, displayCurrency } = useTranslation();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>('savings');
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
    setGoalType('savings');
    setName('');
    setTarget('');
    setCurrency(displayCurrency as GoalCurrency);
    setDeadline('');
    setColor(SWATCHES[0]);
    setIconKey('target');
    setSheetOpen(true);
  };

  const deadlineMissing = goalType === 'income' && !deadline.trim();
  const deadlineInPast = Boolean(deadline.trim()) && deadline < todayIso();

  const onCreate = async () => {
    setSaveError('');
    const n = parseFloat(String(target).replace(',', '.'));
    if (!name.trim() || !Number.isFinite(n) || n <= 0) return;
    if (deadlineMissing) {
      setSaveError(t('goals', 'deadlineRequiredForIncome'));
      return;
    }
    if (deadlineInPast) {
      setSaveError(t('goals', 'deadlineInPast'));
      return;
    }
    try {
      await createGoal({
        name: name.trim(),
        type: goalType,
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
          {g.type === 'income' ? <span className={styles.badge}>{t('goals', 'typeIncome')}</span> : null}
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
        <button type="button" className={styles.back} onClick={goBack}>
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
      {loading ? (
        <p className={styles.emptyText}>{t('common', 'loading')}</p>
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
        <FormSheet
          title={t('goals', 'addGoal')}
          onClose={() => setSheetOpen(false)}
          onSubmit={() => void onCreate()}
          submitLabel={t('goals', 'save')}
          cancelLabel={t('goals', 'cancel')}
          submitDisabled={
            !name.trim() || !(Number(target.replace(',', '.')) > 0) || deadlineMissing || deadlineInPast
          }
          error={saveError || undefined}
        >
          <div className={sheet.heroCard} style={{ background: color }}>
            <span className={styles.heroGlyph}>
              <GoalIcon name={iconKey} color="#fff" size={24} />
            </span>
            <div className={sheet.heroInfo}>
              <span className={sheet.heroName}>{name.trim() || t('goals', 'addGoal')}</span>
              <span className={sheet.heroCaption}>
                {Number(target.replace(',', '.')) > 0
                  ? formatCurrency(Number(target.replace(',', '.')), locale, currency as DisplayCurrency)
                  : t('goals', 'target')}
              </span>
            </div>
          </div>

          <div className={sheet.segment} role="group" aria-label={t('goals', 'goalType')}>
            <button
              type="button"
              className={sheet.segmentBtn}
              aria-pressed={goalType === 'savings'}
              onClick={() => setGoalType('savings')}
            >
              {t('goals', 'typeSavings')}
            </button>
            <button
              type="button"
              className={sheet.segmentBtn}
              aria-pressed={goalType === 'income'}
              onClick={() => setGoalType('income')}
            >
              {t('goals', 'typeIncome')}
            </button>
          </div>

          <div className={sheet.group}>
            <label className={sheet.row}>
              <span className={sheet.rowLabel}>{t('goals', 'name')}</span>
              <input
                className={sheet.rowField}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('goals', 'name')}
              />
            </label>

            <label className={sheet.row}>
              <span className={sheet.rowLabel}>{t('goals', 'target')}</span>
              <input
                className={sheet.rowField}
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="0"
              />
            </label>

            <label className={sheet.row}>
              <span className={sheet.rowLabel}>{t('goals', 'currency')}</span>
              <select
                className={`${sheet.rowField} ${sheet.rowSelect}`}
                value={currency}
                onChange={(e) => setCurrency(e.target.value as GoalCurrency)}
              >
                <option value="UAH">UAH</option>
                <option value="PLN">PLN</option>
                <option value="USD">USD</option>
              </select>
            </label>

            <label className={sheet.row}>
              <span className={sheet.rowLabel}>{t('goals', 'deadline')}</span>
              <input
                className={sheet.rowDatePill}
                type="date"
                min={todayIso()}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
          </div>
          <p className={sheet.groupCaption}>
            {goalType === 'income' ? t('goals', 'deadlineRequiredForIncome') : t('goals', 'deadlineOptional')}
          </p>

          <div>
            <p className={sheet.blockLabel}>{t('goals', 'color')}</p>
            <div className={sheet.colorRow}>
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${sheet.colorDot} ${color === c ? sheet.colorDotActive : ''}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className={sheet.blockLabel}>{t('addTx', 'chooseIcon')}</p>
            <div className={sheet.iconGrid}>
              {ICON_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`${sheet.iconOption} ${iconKey === k ? sheet.iconOptionActive : ''}`}
                  onClick={() => setIconKey(k)}
                  aria-pressed={iconKey === k}
                  aria-label={k}
                >
                  <GoalIcon name={k} color={iconKey === k ? color : 'currentColor'} size={20} />
                </button>
              ))}
            </div>
          </div>
        </FormSheet>
      ) : null}
    </div>
  );
};

export default Goals;
