import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Target,
  Car,
  Plane,
  Shield,
  Trash2,
  Home,
  Briefcase,
  Wallet,
  Heart,
  Gift,
  Rocket,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Flag,
  Gauge,
  Tag,
  Trophy,
  CalendarX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  addContribution,
  deleteContribution,
  deleteGoal,
  getContributions,
  getContributionSources,
  getGoal,
  updateGoal,
  type Goal,
  type GoalContribution,
  type GoalCurrency,
} from '../api/client';
import { normalizeCurrency } from '../utils/currency';
import { isCryptoDenomination } from '../utils/denomination';
import { formatCurrency } from '../utils/formatters';
import type { DisplayCurrency } from '../utils/formatters';
import { useTranslation } from '../i18n/LanguageContext';
import { useGoBack } from '../hooks/useGoBack';
import { showAppConfirm } from '../utils/notify';
import { usePortfolio } from '../context/PortfolioContext';
import styles from './Goals.module.css';
import income from './IncomeGoal.module.css';

const CURRENCY_OPTIONS: GoalCurrency[] = ['UAH', 'PLN', 'USD'];
const SOURCE_PALETTE = [
  'var(--accent-primary-strong)',
  'var(--accent-blue)',
  'var(--accent-orange)',
  'var(--accent-green)',
  'var(--accent-yellow)',
];

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
  const goBack = useGoBack('/goals');
  const { t, locale } = useTranslation();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [contributions, setContributions] = useState<GoalContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contribAmount, setContribAmount] = useState('');
  const [contribNote, setContribNote] = useState('');
  const [contribAccountKey, setContribAccountKey] = useState('');
  const [contribCurrency, setContribCurrency] = useState<GoalCurrency>('UAH');
  const [contribSource, setContribSource] = useState('');
  const [sourceSuggestions, setSourceSuggestions] = useState<string[]>([]);
  const { accounts: rawAccounts } = usePortfolio();
  const portfolioAccounts = useMemo<Array<{ key: string; name: string; currency: GoalCurrency }>>(
    () => {
      const list: Array<{ key: string; name: string; currency: GoalCurrency }> = [];
      for (const row of rawAccounts) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const key = String(r.accountKey ?? '').trim().toLowerCase();
        if (!key) continue;
        // Крипта не має курсу для внеску — сервер її відхиляє, тож і не пропонуємо.
        if (isCryptoDenomination(r.primaryCurrency)) continue;
        const name = String(r.name ?? r.accountKey ?? '').trim().slice(0, 40);
        const cur = normalizeCurrency(String(r.primaryCurrency ?? 'UAH')) as GoalCurrency;
        list.push({ key, name: name || key, currency: cur });
      }
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      return list;
    },
    [rawAccounts],
  );
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

  // Кожен рахунок можна списати в будь-яку ціль незалежно від валюти —
  // сервер конвертує суму за поточним курсом.
  const accountPayOptions = portfolioAccounts;

  useEffect(() => {
    if (!contribAccountKey) return;
    if (!accountPayOptions.some((p) => p.key === contribAccountKey)) {
      setContribAccountKey('');
    }
  }, [accountPayOptions, contribAccountKey]);

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
      setContribCurrency(g.currency);
      if (g.type === 'income') {
        getContributionSources()
          .then(setSourceSuggestions)
          .catch(() => setSourceSuggestions([]));
      }
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

  const incomeStats = useMemo(() => {
    if (!goal || goal.type !== 'income') return null;
    const amountOf = (c: GoalContribution) => (Number.isFinite(c.convertedAmount) ? c.convertedAmount : c.amount);
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const monthPrefix = todayIso.slice(0, 7);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const weekAgoIso = weekAgo.toISOString().slice(0, 10);

    let todayEarned = 0;
    let weekEarned = 0;
    let monthEarned = 0;
    const sourceTotals = new Map<string, number>();
    for (const c of contributions) {
      const amt = amountOf(c);
      if (c.date === todayIso) todayEarned += amt;
      if (c.date >= weekAgoIso) weekEarned += amt;
      if (c.date.startsWith(monthPrefix)) monthEarned += amt;
      const key = c.source && c.source.trim() ? c.source.trim() : t('goals', 'sourceOther');
      sourceTotals.set(key, (sourceTotals.get(key) || 0) + amt);
    }
    const sources = Array.from(sourceTotals.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    const created = new Date(goal.createdAt);
    created.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const elapsedDays = Math.max(0, Math.round((today.getTime() - created.getTime()) / 86400000));
    const totalDays = goal.deadline
      ? Math.max(1, Math.round((new Date(`${goal.deadline}T00:00:00`).getTime() - created.getTime()) / 86400000))
      : null;

    const rawPct = goal.targetAmount > 0 ? (goal.saved / goal.targetAmount) * 100 : 0;
    const reached = goal.targetAmount > 0 && goal.saved >= goal.targetAmount;
    const expired = !reached && days !== null && days < 0;
    const phase: 'running' | 'done' | 'expired' = reached ? 'done' : expired ? 'expired' : 'running';

    // Скільки днів пішло на ціль: дата внеску, який перетнув планку.
    let reachedInDays: number | null = null;
    if (reached) {
      const ascending = [...contributions].sort((a, b) => a.date.localeCompare(b.date));
      let running = 0;
      for (const c of ascending) {
        running += amountOf(c);
        if (running >= goal.targetAmount) {
          const at = new Date(`${c.date}T00:00:00`);
          reachedInDays = Math.max(0, Math.round((at.getTime() - created.getTime()) / 86400000));
          break;
        }
      }
    }

    const daysLeft = days !== null ? Math.max(0, days) : null;
    const neededPerDay = daysLeft && daysLeft > 0 ? remaining / daysLeft : remaining;
    // Після фінішу денна норма вже ні до чого — показуємо реальний темп забігу.
    const paceDays = reached
      ? Math.max(1, reachedInDays ?? elapsedDays)
      : Math.max(1, totalDays ?? elapsedDays);
    const actualPerDay = goal.saved / paceDays;

    let trajectory: { ahead: boolean; delta: number; catchUpPerDay: number } | null = null;
    if (phase === 'running' && totalDays !== null) {
      const cappedElapsed = Math.min(totalDays, elapsedDays);
      const expectedByNow = (goal.targetAmount / totalDays) * cappedElapsed;
      const delta = goal.saved - expectedByNow;
      const catchUpPerDay = delta < 0 && daysLeft && daysLeft > 0 ? Math.abs(delta) / daysLeft : 0;
      trajectory = { ahead: delta >= 0, delta, catchUpPerDay };
    }

    return {
      todayEarned,
      weekEarned,
      monthEarned,
      sources,
      neededPerDay,
      actualPerDay,
      trajectory,
      phase,
      rawPct,
      reachedInDays,
      totalDays,
      overachieved: Math.max(0, goal.saved - goal.targetAmount),
    };
  }, [goal, contributions, days, remaining, t]);

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
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
      setActionError(code === 'DEADLINE_REQUIRED' ? t('goals', 'deadlineRequiredForIncome') : t('goals', 'saveError'));
    }
  };

  const onAddContribution = async () => {
    if (!id || !goal) return;
    setActionError('');
    const n = parseFloat(String(contribAmount).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    try {
      await addContribution(id, {
        amount: n,
        date: todayIso,
        note: contribNote.trim(),
        accountKey: contribAccountKey.trim() ? contribAccountKey.trim().toLowerCase() : undefined,
        currency: contribCurrency,
        source: goal.type === 'income' ? contribSource.trim() : undefined,
      });
      setContribAmount('');
      setContribNote('');
      setContribSource('');
      await load();
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
      if (code === 'ACCOUNT_CURRENCY_UNSUPPORTED') {
        setActionError(t('goals', 'cryptoAccountUnsupported'));
      } else {
        setActionError(t('goals', 'saveError'));
      }
    }
  };

  const onDeleteContrib = async (contribId: string) => {
    if (!id) return;
    if (!(await showAppConfirm(t('goals', 'deleteContribConfirm')))) return;
    try {
      await deleteContribution(id, contribId);
      await load();
    } catch {
      setActionError(t('goals', 'saveError'));
    }
  };

  const onDeleteGoal = async () => {
    if (!id) return;
    if (!(await showAppConfirm(t('goals', 'deleteConfirm')))) return;
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
        <p className={styles.emptyText}>{t('common', 'loading')}</p>
      </div>
    );
  }

  if (error || !goal) {
    return (
      <div className={styles.container}>
        <button type="button" className={styles.back} onClick={goBack}>
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
        <button type="button" className={styles.back} onClick={goBack}>
          ← {t('goals', 'title')}
        </button>
      </header>

      {actionError ? (
        <p className={styles.bannerError} role="alert">
          {actionError}
        </p>
      ) : null}

      {goal.type === 'income' && incomeStats ? (
        <>
          <div className={income.hero}>
            <div className={income.heroTop}>
              <div className={income.heroIconWrap}>
                <Rocket size={22} strokeWidth={2} />
              </div>
              <div>
                <p className={income.heroEyebrow}>{t('goals', 'roadTo')}</p>
                <h1 className={income.heroTitle}>{goal.name}</h1>
              </div>
            </div>
            <div className={styles.badgeRow} style={{ marginBottom: 10 }}>
              {pct >= 100 ? <span className={`${styles.badge} ${styles.badgeDone}`}>{t('goals', 'completed')}</span> : null}
              {goal.archived ? <span className={styles.badge}>{t('goals', 'archived')}</span> : null}
            </div>
            <div className={income.amountRow}>
              <span className={income.amountCurrent}>{formatCurrency(goal.saved, locale, cur)}</span>
              <span className={income.amountTarget}>/ {formatCurrency(goal.targetAmount, locale, cur)}</span>
            </div>
            <div className={income.progressTrack}>
              <div className={income.progressFill} style={{ width: `${pct}%` }} />
            </div>
            <div className={income.progressMeta}>
              <span className={income.progressPct}>{incomeStats.rawPct.toFixed(1)}%</span>
              {incomeStats.phase === 'running' && days !== null ? (
                <span className={income.progressDays}>
                  {t('goals', 'daysLeft').replace('{n}', String(Math.max(0, days)))}
                </span>
              ) : incomeStats.phase === 'expired' ? (
                <span className={income.progressDays}>{t('goals', 'overdue')}</span>
              ) : null}
            </div>
          </div>

          {incomeStats.phase === 'done' ? (
            <div className={`${income.trajectory} ${income.trajectoryAhead}`}>
              <div className={income.trajectoryIcon}>
                <Trophy size={17} strokeWidth={2.4} />
              </div>
              <div className={income.trajectoryBody}>
                <p className={income.trajectoryTitle}>
                  {incomeStats.reachedInDays !== null
                    ? t('goals', 'goalReachedInDays').replace('{n}', String(incomeStats.reachedInDays))
                    : t('goals', 'goalReached')}
                </p>
                <p className={income.trajectorySub}>
                  {incomeStats.overachieved > 0
                    ? t('goals', 'goalOverachieved').replace(
                        '{amount}',
                        formatCurrency(incomeStats.overachieved, locale, cur)
                      )
                    : t('goals', 'goalReachedHint')}
                </p>
              </div>
            </div>
          ) : incomeStats.phase === 'expired' ? (
            <div className={`${income.trajectory} ${income.trajectoryNeutral}`}>
              <div className={income.trajectoryIcon}>
                <CalendarX size={17} strokeWidth={2.4} />
              </div>
              <div className={income.trajectoryBody}>
                <p className={income.trajectoryTitle}>{t('goals', 'deadlinePassed')}</p>
                <p className={income.trajectorySub}>
                  {t('goals', 'deadlinePassedHint')
                    .replace('{amount}', formatCurrency(goal.saved, locale, cur))
                    .replace('{target}', formatCurrency(goal.targetAmount, locale, cur))
                    .replace('{pct}', incomeStats.rawPct.toFixed(1))
                    .replace('{n}', String(incomeStats.totalDays ?? 0))}
                </p>
              </div>
            </div>
          ) : incomeStats.trajectory ? (
            <div
              className={`${income.trajectory} ${incomeStats.trajectory.ahead ? income.trajectoryAhead : income.trajectoryBehind}`}
            >
              <div className={income.trajectoryIcon}>
                {incomeStats.trajectory.ahead ? (
                  <TrendingUp size={17} strokeWidth={2.4} />
                ) : (
                  <TrendingDown size={17} strokeWidth={2.4} />
                )}
              </div>
              <div className={income.trajectoryBody}>
                <p className={income.trajectoryTitle}>
                  {(incomeStats.trajectory.ahead ? t('goals', 'aheadOfPlan') : t('goals', 'behindPlan')).replace(
                    '{amount}',
                    formatCurrency(Math.abs(incomeStats.trajectory.delta), locale, cur)
                  )}
                </p>
                <p className={income.trajectorySub}>
                  {incomeStats.trajectory.ahead
                    ? t('goals', 'aheadOfPlanHint')
                    : t('goals', 'behindPlanHint').replace(
                        '{amount}',
                        formatCurrency(incomeStats.trajectory.catchUpPerDay, locale, cur)
                      )}
                </p>
              </div>
            </div>
          ) : null}

          <h2 className={income.sectionTitle}>{t('goals', 'progressSection')}</h2>
          <div className={income.group}>
            <div className={income.row}>
              <div className={income.rowIcon} style={{ background: 'var(--accent-green)' }}>
                <Wallet size={16} strokeWidth={2.2} />
              </div>
              <span className={income.rowLabel}>{t('goals', 'earnedToday')}</span>
              <span className={income.rowValue}>{formatCurrency(incomeStats.todayEarned, locale, cur)}</span>
            </div>
            <div className={income.row}>
              <div className={income.rowIcon} style={{ background: 'var(--accent-blue)' }}>
                <CalendarDays size={16} strokeWidth={2.2} />
              </div>
              <span className={income.rowLabel}>{t('goals', 'earnedWeek')}</span>
              <span className={income.rowValue}>{formatCurrency(incomeStats.weekEarned, locale, cur)}</span>
            </div>
            <div className={income.row}>
              <div className={income.rowIcon} style={{ background: 'var(--accent-primary-strong)' }}>
                <TrendingUp size={16} strokeWidth={2.2} />
              </div>
              <span className={income.rowLabel}>{t('goals', 'earnedMonth')}</span>
              <span className={income.rowValue}>{formatCurrency(incomeStats.monthEarned, locale, cur)}</span>
            </div>
            <div className={income.row}>
              <div className={income.rowIcon} style={{ background: 'var(--accent-orange)' }}>
                <Flag size={16} strokeWidth={2.2} />
              </div>
              <span className={income.rowLabel}>{t('goals', 'remaining')}</span>
              <span className={income.rowValue}>{formatCurrency(remaining, locale, cur)}</span>
            </div>
            <div className={income.row}>
              <div className={income.rowIcon} style={{ background: 'var(--accent-yellow)', color: '#1a1200' }}>
                <Gauge size={16} strokeWidth={2.2} />
              </div>
              <span className={income.rowLabel}>
                {incomeStats.phase === 'running' ? t('goals', 'neededPerDay') : t('goals', 'actualPerDay')}
              </span>
              <span className={income.rowValue}>
                {formatCurrency(
                  incomeStats.phase === 'running' ? incomeStats.neededPerDay : incomeStats.actualPerDay,
                  locale,
                  cur
                )}
              </span>
            </div>
          </div>

          {incomeStats.sources.length > 0
            ? (() => {
                const total = incomeStats.sources.reduce((a, b) => a + b.amount, 0);
                return (
                  <>
                    <h2 className={income.sectionTitle}>{t('goals', 'incomeSources')}</h2>
                    <div className={income.sourceList}>
                      {incomeStats.sources.map((s, idx) => {
                        const share = total > 0 ? (s.amount / total) * 100 : 0;
                        const color = SOURCE_PALETTE[idx % SOURCE_PALETTE.length];
                        return (
                          <div key={s.name} className={income.sourceCard}>
                            <div className={income.sourceTop}>
                              <div className={income.sourceIcon} style={{ background: color }}>
                                <Tag size={14} strokeWidth={2.2} />
                              </div>
                              <span className={income.sourceName}>{s.name}</span>
                              <span className={income.sourceAmount}>{formatCurrency(s.amount, locale, cur)}</span>
                              <span className={income.sourceSharePct}>{Math.round(share)}%</span>
                            </div>
                            <div className={income.sourceBarTrack}>
                              <div className={income.sourceBarFill} style={{ width: `${share}%`, background: color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()
            : null}
        </>
      ) : (
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
      )}

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
          <label className={styles.label} id="c-pay-label">
            {t('goals', 'payFromAccount')}
          </label>
          <p className={styles.goalPayHint} id="c-pay-hint">
            {t('goals', 'payFromHint')}
          </p>
          <div className={styles.goalPayChips} role="group" aria-labelledby="c-pay-label c-pay-hint">
            <button
              type="button"
              className={`${styles.goalPayChip} ${contribAccountKey === '' ? styles.goalPayChipActive : ''}`}
              onClick={() => setContribAccountKey('')}
            >
              {t('addTx', 'paymentAccountNone')}
            </button>
            {accountPayOptions.map(({ key, name }) => (
              <button
                key={key}
                type="button"
                className={`${styles.goalPayChip} ${contribAccountKey === key ? styles.goalPayChipActive : ''}`}
                onClick={() => setContribAccountKey(key)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        {contribAccountKey === '' ? (
          <div className={styles.field}>
            <label className={styles.label} id="c-cur-label">
              {t('goals', 'contributionCurrency')}
            </label>
            <div className={styles.goalPayChips} role="group" aria-labelledby="c-cur-label">
              {CURRENCY_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.goalPayChip} ${contribCurrency === c ? styles.goalPayChipActive : ''}`}
                  onClick={() => setContribCurrency(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {goal.type === 'income' ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="c-source">
              {t('goals', 'contributionSource')}
            </label>
            {sourceSuggestions.length > 0 ? (
              <div className={styles.goalPayChips} style={{ marginBottom: 8 }}>
                {sourceSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`${styles.goalPayChip} ${contribSource === s ? styles.goalPayChipActive : ''}`}
                    onClick={() => setContribSource(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
            <input
              id="c-source"
              className={styles.input}
              value={contribSource}
              onChange={(e) => setContribSource(e.target.value)}
              onFocus={(e) => ensureFieldVisible(e.currentTarget)}
              placeholder={t('goals', 'contributionSourcePlaceholder')}
            />
          </div>
        ) : null}
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
          {contributions.map((c) => {
            const converted = Number.isFinite(c.convertedAmount) ? c.convertedAmount : c.amount;
            const isForeign = c.currency !== goal.currency;
            return (
              <div key={c.id} className={styles.contribRow}>
                <div className={styles.contribMain}>
                  <div className={styles.contribDate}>{new Date(c.date + 'T12:00:00').toLocaleDateString(locale)}</div>
                  {c.source ? <p className={styles.contribNote}>{c.source}</p> : null}
                  {c.note ? <p className={styles.contribNote}>{c.note}</p> : null}
                  {isForeign ? (
                    <p className={styles.contribNote}>{formatCurrency(c.amount, locale, c.currency as DisplayCurrency)}</p>
                  ) : null}
                  {c.transactionId ? (
                    <span className={styles.contribAccountBadge}>{t('goals', 'fromAccountShort')}</span>
                  ) : null}
                </div>
                <span className={styles.contribAmt}>{formatCurrency(converted, locale, cur)}</span>
                <button type="button" className={styles.iconBtn} aria-label={t('goals', 'delete')} onClick={() => void onDeleteContrib(c.id)}>
                  <Trash2 size={18} />
                </button>
              </div>
            );
          })}
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
              {goal.type === 'income' ? <p className={styles.meta}>{t('goals', 'deadlineRequiredForIncome')}</p> : null}
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
