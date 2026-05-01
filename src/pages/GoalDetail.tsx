import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Target, Car, Plane, Shield, Trash2, Home, Briefcase, Wallet, Heart, Gift } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  addContribution,
  deleteContribution,
  deleteGoal,
  getContributions,
  getGoal,
  updateGoal,
  type Goal,
  type GoalContribution,
  type GoalCurrency,
} from '../api/client';
import { formatCurrency } from '../utils/formatters';
import type { DisplayCurrency } from '../utils/formatters';
import { useTranslation } from '../i18n/LanguageContext';
import styles from './Goals.module.css';

const GOAL_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
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

const GoalIcon: React.FC<{ name: string; color: string; size?: number }> = ({ name, color, size = 28 }) => {
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

const GoalDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, locale } = useTranslation();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [contributions, setContributions] = useState<GoalContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contribAmount, setContribAmount] = useState('');
  const [contribNote, setContribNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editCurrency, setEditCurrency] = useState<GoalCurrency>('UAH');
  const [editDeadline, setEditDeadline] = useState('');
  const [editColor, setEditColor] = useState<string>(SWATCHES[0]);
  const [editIcon, setEditIcon] = useState<(typeof ICON_KEYS)[number]>('target');
  const [editArchived, setEditArchived] = useState(false);

  const ensureFieldVisible = (el: HTMLElement) => {
    window.setTimeout(() => {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }, 120);
  };

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const [g, c] = await Promise.all([getGoal(id), getContributions(id)]);
      setGoal(g);
      setContributions(Array.isArray(c) ? c : []);
    } catch {
      setError(t('goals', 'loadError'));
      setGoal(null);
      setContributions([]);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    if (!id) {
      navigate('/goals', { replace: true });
      return;
    }
    void load();
  }, [id, navigate, load]);

  const pct = useMemo(
    () => (goal ? progressPct(goal.saved, goal.targetAmount) : 0),
    [goal]
  );
  const fill = goal ? fillColorForPct(pct, goal.color) : '#7C5CFF';
  const remaining = goal ? Math.max(0, goal.targetAmount - goal.saved) : 0;
  const days = goal ? deadlineDeltaDays(goal.deadline) : null;

  const openEdit = () => {
    if (!goal) return;
    setActionError('');
    setEditName(goal.name);
    setEditTarget(String(goal.targetAmount));
    setEditCurrency(goal.currency);
    setEditDeadline(goal.deadline ?? '');
    setEditColor(GOAL_COLOR_RE.test(goal.color) ? goal.color : SWATCHES[0]);
    setEditIcon(
      ICON_KEYS.includes(goal.icon as (typeof ICON_KEYS)[number]) ? (goal.icon as (typeof ICON_KEYS)[number]) : 'target'
    );
    setEditArchived(goal.archived);
    setEditOpen(true);
  };

  const onSaveEdit = async () => {
    if (!id || !goal) return;
    setActionError('');
    const n = parseFloat(String(editTarget).replace(',', '.'));
    if (!editName.trim() || !Number.isFinite(n) || n <= 0) return;
    try {
      const updated = await updateGoal(id, {
        name: editName.trim(),
        targetAmount: n,
        currency: editCurrency,
        deadline: editDeadline.trim() || null,
        color: editColor,
        icon: editIcon,
        archived: editArchived,
      });
      setGoal(updated);
      setEditOpen(false);
    } catch {
      setActionError(t('goals', 'saveError'));
    }
  };

  const onAddContribution = async () => {
    if (!id) return;
    setActionError('');
    const n = parseFloat(String(contribAmount).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    try {
      await addContribution(id, { amount: n, date: todayIso, note: contribNote.trim() });
      setContribAmount('');
      setContribNote('');
      await load();
    } catch {
      setActionError(t('goals', 'saveError'));
    }
  };

  const onDeleteContrib = async (contribId: string) => {
    if (!id) return;
    if (!window.confirm(t('goals', 'deleteContribConfirm'))) return;
    try {
      await deleteContribution(id, contribId);
      await load();
    } catch {
      setActionError(t('goals', 'saveError'));
    }
  };

  const onDeleteGoal = async () => {
    if (!id) return;
    if (!window.confirm(t('goals', 'deleteConfirm'))) return;
    try {
      await deleteGoal(id);
      navigate('/goals');
    } catch {
      setActionError(t('goals', 'saveError'));
    }
  };

  if (!id) {
    return null;
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <p className={styles.emptyText}>{t('planner', 'loading')}</p>
      </div>
    );
  }

  if (error || !goal) {
    return (
      <div className={styles.container}>
        <button type="button" className={styles.back} onClick={() => navigate('/goals')}>
          ← {t('goals', 'title')}
        </button>
        <p className={styles.bannerError} role="alert">
          {error || t('goals', 'loadError')}
        </p>
      </div>
    );
  }

  const cur = goal.currency as DisplayCurrency;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate('/goals')}>
          ← {t('goals', 'title')}
        </button>
      </header>

      {actionError ? (
        <p className={styles.bannerError} role="alert">
          {actionError}
        </p>
      ) : null}

      <div className={styles.detailHero}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div className={styles.iconWrap} style={{ backgroundColor: `${goal.color}22` }}>
            <GoalIcon name={goal.icon} color={goal.color} />
          </div>
          <h1 className={styles.detailTitle} style={{ margin: 0 }}>
            {goal.name}
          </h1>
        </div>
        <div className={styles.badgeRow}>
          {pct >= 100 ? <span className={`${styles.badge} ${styles.badgeDone}`}>{t('goals', 'completed')}</span> : null}
          {goal.archived ? <span className={styles.badge}>{t('goals', 'archived')}</span> : null}
        </div>
        <div className={styles.pctRow}>
          <span className={styles.amountStrong}>
            {formatCurrency(goal.saved, locale, cur)} / {formatCurrency(goal.targetAmount, locale, cur)}
          </span>
          <span>{Math.round(pct)}%</span>
        </div>
        <div className={`${styles.progressTrack} ${styles.detailProgress}`}>
          <div className={styles.progressFill} style={{ width: `${pct}%`, background: fill }} />
        </div>
        <p className={styles.meta}>
          {t('goals', 'remaining')}: {formatCurrency(remaining, locale, cur)}
        </p>
        {goal.deadline ? (
          <p className={styles.meta}>
            {t('goals', 'deadline')}: {new Date(goal.deadline + 'T12:00:00').toLocaleDateString(locale)}
            {days !== null ? (
              <>
                {' '}
                (
                {days < 0 ? t('goals', 'overdue') : t('goals', 'daysLeft').replace('{n}', String(Math.max(0, days)))})
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className={styles.toolbar}>
        <button type="button" className={styles.toolbarBtn} onClick={openEdit}>
          {t('goals', 'edit')}
        </button>
        <button type="button" className={`${styles.toolbarBtn} ${styles.toolbarBtnDanger}`} onClick={() => void onDeleteGoal()}>
          {t('goals', 'delete')}
        </button>
      </div>

      <div className={styles.formCard}>
        <h2 className={styles.sectionTitle}>{t('goals', 'contribute')}</h2>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="c-amt">
            {t('goals', 'contributionAmount')}
          </label>
          <input
            id="c-amt"
            className={styles.input}
            inputMode="decimal"
            value={contribAmount}
            onChange={(e) => setContribAmount(e.target.value)}
            onFocus={(e) => ensureFieldVisible(e.currentTarget)}
            placeholder="0"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="c-note">
            {t('goals', 'contributionNote')}
          </label>
          <input
            id="c-note"
            className={styles.input}
            value={contribNote}
            onChange={(e) => setContribNote(e.target.value)}
            onFocus={(e) => ensureFieldVisible(e.currentTarget)}
          />
        </div>
        <button type="button" className={styles.btnPrimary} style={{ width: '100%', marginTop: 8 }} onClick={() => void onAddContribution()}>
          {t('goals', 'contribute')}
        </button>
      </div>

      <h2 className={styles.sectionTitle}>{t('goals', 'contributionsTitle')}</h2>
      {contributions.length === 0 ? (
        <p className={styles.meta}>{t('goals', 'noContributions')}</p>
      ) : (
        <div className={styles.contribList}>
          {contributions.map((c) => (
            <div key={c.id} className={styles.contribRow}>
              <div className={styles.contribMain}>
                <div className={styles.contribDate}>{new Date(c.date + 'T12:00:00').toLocaleDateString(locale)}</div>
                {c.note ? <p className={styles.contribNote}>{c.note}</p> : null}
              </div>
              <span className={styles.contribAmt}>{formatCurrency(c.amount, locale, cur)}</span>
              <button type="button" className={styles.iconBtn} aria-label={t('goals', 'delete')} onClick={() => void onDeleteContrib(c.id)}>
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {editOpen ? (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditOpen(false);
          }}
        >
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.sheetTitle}>{t('goals', 'edit')}</h2>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="e-name">
                {t('goals', 'name')}
              </label>
              <input
                id="e-name"
                className={styles.input}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onFocus={(e) => ensureFieldVisible(e.currentTarget)}
              />
            </div>
            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="e-target">
                  {t('goals', 'target')}
                </label>
                <input
                  id="e-target"
                  className={styles.input}
                  inputMode="decimal"
                  value={editTarget}
                  onChange={(e) => setEditTarget(e.target.value)}
                  onFocus={(e) => ensureFieldVisible(e.currentTarget)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="e-cur">
                  {t('goals', 'currency')}
                </label>
                <select
                  id="e-cur"
                  className={styles.input}
                  value={editCurrency}
                  onChange={(e) => setEditCurrency(e.target.value as GoalCurrency)}
                  onFocus={(e) => ensureFieldVisible(e.currentTarget)}
                >
                  <option value="UAH">UAH</option>
                  <option value="PLN">PLN</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="e-deadline">
                {t('goals', 'deadline')}
              </label>
              <input
                id="e-deadline"
                className={`${styles.input} ${styles.dateInput}`}
                type="date"
                value={editDeadline}
                onChange={(e) => setEditDeadline(e.target.value)}
                onFocus={(e) => ensureFieldVisible(e.currentTarget)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>{t('goals', 'color')}</span>
              <div className={styles.swatches}>
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`${styles.swatch} ${editColor === c ? styles.swatchActive : ''}`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                    onClick={() => setEditColor(c)}
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
                    className={`${styles.swatch} ${editIcon === k ? styles.swatchActive : ''}`}
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                    onClick={() => setEditIcon(k)}
                    aria-label={k}
                  >
                    <GoalIcon name={k} color={editColor} size={18} />
                  </button>
                ))}
              </div>
            </div>
            <label className={styles.field} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={editArchived} onChange={(e) => setEditArchived(e.target.checked)} />
              <span>{t('goals', 'archived')}</span>
            </label>
            <div className={styles.sheetActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setEditOpen(false)}>
                {t('goals', 'cancel')}
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => void onSaveEdit()}>
                {t('goals', 'save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default GoalDetail;
