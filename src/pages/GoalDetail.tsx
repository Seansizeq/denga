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
  TrendingUp,
  TrendingDown,
  Tag,
  Trophy,
  CalendarX,
  Plus,
  ImageDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  addContribution,
  deleteContribution,
  getContributions,
  getContributionSources,
  getGoal,
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
import FormSheet from '../components/ui/FormSheet';
import GoalResultCardSheet from '../components/goals/GoalResultCardSheet';
import sheet from '../components/ui/FormSheet.module.css';
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
  const [contributeOpen, setContributeOpen] = useState(false);
  const [goalResultOpen, setGoalResultOpen] = useState(false);
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
    // Стартова сума не має джерела, але без неї відсотки не збігались би з
    // сумою цілі — тож вона стоїть у розбивці окремим рядком.
    if (goal.baselineAmount > 0) {
      const label = t('goals', 'baselineSourceLabel');
      sourceTotals.set(label, (sourceTotals.get(label) || 0) + goal.baselineAmount);
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
      let running = goal.baselineAmount;
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
    // Стартова сума в темп не входить: її не заробляли протягом цих днів.
    const paceDays = reached
      ? Math.max(1, reachedInDays ?? elapsedDays)
      : Math.max(1, totalDays ?? elapsedDays);
    const actualPerDay = Math.max(0, goal.saved - goal.baselineAmount) / paceDays;

    let trajectory: { ahead: boolean; delta: number; catchUpPerDay: number } | null = null;
    if (phase === 'running' && totalDays !== null) {
      const cappedElapsed = Math.min(totalDays, elapsedDays);
      // План стартує не з нуля, а зі стартової суми.
      const expectedByNow =
        goal.baselineAmount + ((goal.targetAmount - goal.baselineAmount) / totalDays) * cappedElapsed;
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

  const openContribute = () => {
    if (!goal) return;
    setActionError('');
    setContribAmount('');
    setContribNote('');
    setContribSource('');
    setContribAccountKey('');
    setContribCurrency(goal.currency);
    setContributeOpen(true);
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
      setContributeOpen(false);
      await load();
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
      if (code === 'ACCOUNT_CURRENCY_UNSUPPORTED') {
        setActionError(t('goals', 'cryptoAccountUnsupported'));
      } else if (code === 'ACCOUNT_NOT_FOR_INCOME') {
        setActionError(t('goals', 'accountNotForIncome'));
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

          <button type="button" className={styles.goalResultImageBtn} onClick={() => setGoalResultOpen(true)}>
            <ImageDown size={18} aria-hidden="true" />
            {t('goals', 'goalResultImage')}
          </button>

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

          <div className={styles.actions}>
            <button type="button" className={`${styles.actionBtn} ${styles.actionPrimary}`} onClick={openContribute}>
              <Plus size={20} strokeWidth={2.4} />
              {t('goals', 'contribute')}
            </button>
          </div>

          <div className={income.statRow}>
            <div className={income.statTile}>
              <span className={income.statValue}>{formatCurrency(incomeStats.weekEarned, locale, cur)}</span>
              <span className={income.statLabel}>{t('goals', 'earnedWeek')}</span>
            </div>
            <div className={income.statTile}>
              <span className={income.statValue}>{formatCurrency(incomeStats.monthEarned, locale, cur)}</span>
              <span className={income.statLabel}>{t('goals', 'earnedMonth')}</span>
            </div>
            <div className={income.statTile}>
              <span className={income.statValue}>
                {formatCurrency(
                  incomeStats.phase === 'running' ? incomeStats.neededPerDay : incomeStats.actualPerDay,
                  locale,
                  cur
                )}
              </span>
              <span className={income.statLabel}>
                {incomeStats.phase === 'running' ? t('goals', 'neededPerDay') : t('goals', 'actualPerDay')}
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
        <>
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
          <button type="button" className={styles.goalResultImageBtn} onClick={() => setGoalResultOpen(true)}>
            <ImageDown size={18} aria-hidden="true" />
            {t('goals', 'goalResultImage')}
          </button>
        </>
      )}

      {goal.type === 'income' ? null : (
        <div className={styles.actions}>
          <button type="button" className={`${styles.actionBtn} ${styles.actionPrimary}`} onClick={openContribute}>
            <Plus size={20} strokeWidth={2.4} />
            {t('goals', 'contribute')}
          </button>
        </div>
      )}

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

      <GoalResultCardSheet
        open={goalResultOpen}
        onClose={() => setGoalResultOpen(false)}
        goal={goal}
      />

      {contributeOpen ? (
        <FormSheet
          title={t('goals', 'contribute')}
          onClose={() => setContributeOpen(false)}
          onSubmit={() => void onAddContribution()}
          submitLabel={t('goals', 'save')}
          cancelLabel={t('goals', 'cancel')}
          submitDisabled={!(Number(contribAmount.replace(',', '.')) > 0)}
          error={actionError || undefined}
        >
          <div className={sheet.group}>
            <label className={sheet.row}>
              <span className={sheet.rowLabel}>{t('goals', 'contributionAmount')}</span>
              <input
                className={sheet.rowField}
                inputMode="decimal"
                value={contribAmount}
                onChange={(e) => setContribAmount(e.target.value)}
                placeholder="0"
              />
            </label>

            <label className={sheet.row}>
              <span className={sheet.rowLabel}>{t('goals', 'contributionCurrency')}</span>
              <select
                className={`${sheet.rowField} ${sheet.rowSelect}`}
                value={contribCurrency}
                onChange={(e) => setContribCurrency(e.target.value as GoalCurrency)}
                disabled={contribAccountKey !== ''}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            {goal.type === 'savings' ? (
              <label className={sheet.row}>
                <span className={sheet.rowLabel}>{t('goals', 'payFromAccount')}</span>
                <select
                  className={`${sheet.rowField} ${sheet.rowSelect}`}
                  value={contribAccountKey}
                  onChange={(e) => setContribAccountKey(e.target.value)}
                >
                  <option value="">{t('addTx', 'paymentAccountNone')}</option>
                  {accountPayOptions.map(({ key, name, currency: accCur }) => (
                    <option key={key} value={key}>
                      {name} · {accCur}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className={sheet.row}>
              <span className={sheet.rowLabel}>{t('goals', 'contributionNote')}</span>
              <input
                className={sheet.rowField}
                value={contribNote}
                onChange={(e) => setContribNote(e.target.value)}
                placeholder={t('goals', 'contributionNote')}
              />
            </label>
          </div>
          <p className={sheet.groupCaption}>
            {goal.type === 'income' ? t('goals', 'incomeNoWalletHint') : t('goals', 'payFromHint')}
          </p>

          {goal.type === 'income' ? (
            <div>
              <p className={sheet.blockLabel}>{t('goals', 'contributionSource')}</p>
              <div className={sheet.group}>
                <label className={sheet.row}>
                  <input
                    className={sheet.rowField}
                    style={{ textAlign: 'left' }}
                    value={contribSource}
                    onChange={(e) => setContribSource(e.target.value)}
                    placeholder={t('goals', 'contributionSourcePlaceholder')}
                  />
                </label>
              </div>
              {sourceSuggestions.length > 0 ? (
                <div className={styles.goalPayChips} style={{ marginTop: 10 }}>
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
            </div>
          ) : null}
        </FormSheet>
      ) : null}

    </div>
  );
};

export default GoalDetail;
