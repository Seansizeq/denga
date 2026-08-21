import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Trash2,
  Rocket,
  TrendingUp,
  Tag,
  Trophy,
  CalendarX,
  Plus,
  ImageDown,
  Archive,
  TriangleAlert,
} from 'lucide-react';
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
import { formatCurrency, formatDeltaCurrency, formatSignedCurrency } from '../utils/formatters';
import type { DisplayCurrency } from '../utils/formatters';
import { localIsoDate } from '../utils/dateRanges';
import { computeGoalPace, deadlineDeltaDays, fillColorForPct, progressPct, sumAccountPeriodDeltas } from '../utils/goals';
import { useTranslation } from '../i18n/LanguageContext';
import { useGoBack } from '../hooks/useGoBack';
import { showAppConfirm } from '../utils/notify';
import { usePortfolio } from '../context/PortfolioContext';
import { useDenominationRates } from '../hooks/useDenominationRates';
import { useTransactions } from '../context/TransactionContext';
import { getTransactionAccountEffects, getTransactionNotePreview } from '../utils/transactionUtils';
import type { Transaction } from '../types';
import FormSheet from '../components/ui/FormSheet';
import GoalIcon from '../components/goals/GoalIcon';
import GoalResultCardSheet from '../components/goals/GoalResultCardSheet';
import type { GoalResultScope } from '../components/goals/GoalResultCardSheet';
import sheet from '../components/ui/FormSheet.module.css';
import styles from './Goals.module.css';
import hero from './GoalDetail.shared.module.css';

const CURRENCY_OPTIONS: GoalCurrency[] = ['UAH', 'PLN', 'USD'];
const SOURCE_PALETTE = [
  'var(--accent-primary-strong)',
  'var(--accent-blue)',
  'var(--accent-orange)',
  'var(--accent-green)',
  'var(--accent-yellow)',
];

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
  /** null — картинку закрито; інакше що саме вона показує. */
  const [resultScope, setResultScope] = useState<GoalResultScope | null>(null);
  const [sourceSuggestions, setSourceSuggestions] = useState<string[]>([]);
  const { accounts: rawAccounts } = usePortfolio();
  const { transactions } = useTransactions();
  const { convert } = useDenominationRates();
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
  const fill = goal ? fillColorForPct(pct, goal.color) : 'var(--accent-primary)';
  const days = goal ? deadlineDeltaDays(goal.deadline) : null;

  /** Темп і траєкторія — однакові для обох типів цілі, різниця лише в подачі. */
  const pace = useMemo(
    () =>
      goal
        ? computeGoalPace({
            saved: goal.saved,
            target: goal.targetAmount,
            baseline: goal.baselineAmount,
            createdAt: goal.createdAt,
            deadline: goal.deadline,
            contributions,
          })
        : null,
    [goal, contributions]
  );

  /** Розбивка за джерелами — має сенс лише для цілі-заробітку. */
  const sources = useMemo(() => {
    if (!goal || goal.type !== 'income') return [];
    const totals = new Map<string, number>();
    for (const c of contributions) {
      const amt = Number.isFinite(c.convertedAmount) ? c.convertedAmount : c.amount;
      const key = c.source && c.source.trim() ? c.source.trim() : t('goals', 'sourceOther');
      totals.set(key, (totals.get(key) || 0) + amt);
    }
    // Стартова сума не має джерела, але без неї відсотки не збігались би з
    // сумою цілі — тож вона стоїть у розбивці окремим рядком.
    if (goal.baselineAmount > 0) {
      const label = t('goals', 'baselineSourceLabel');
      totals.set(label, (totals.get(label) || 0) + goal.baselineAmount);
    }
    return Array.from(totals.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [goal, contributions, t]);

  /**
   * Усі рухи на рахунку цілі. `delta` — у валюті цілі (саме нею міряється
   * прогрес), `rawDelta` — у валюті самої транзакції, як її показувати в рядку.
   *
   * Рахунок для доходу й витрати живе в маркері примітки, а не в колонці, тож
   * шукати його треба тією ж функцією, якою його читає решта застосунку.
   */
  const accountMovements = useMemo(() => {
    const account = goal?.accountKey;
    if (!account || !goal) return [];
    const rows: Array<{ tx: Transaction; delta: number; rawDelta: number; rawCurrency: string }> = [];
    for (const tx of transactions) {
      const effect = getTransactionAccountEffects(tx).find((e) => e.accountKey === account);
      if (!effect) continue;
      const converted = convert(Math.abs(effect.delta), effect.currency, goal.currency);
      // Неконвертований рух краще пропустити, ніж додати як «одиниця = одиниця».
      if (converted === null) continue;
      rows.push({
        tx,
        delta: effect.delta < 0 ? -converted : converted,
        rawDelta: effect.delta,
        rawCurrency: effect.currency,
      });
    }
    return rows.sort((a, b) => b.tx.date.localeCompare(a.tx.date));
  }, [transactions, goal, convert]);

  /** Те саме, але без внесків: їх показує окремий список вище. */
  const otherMovements = useMemo(() => {
    const contributionTxIds = new Set(contributions.map((c) => c.transactionId).filter(Boolean));
    return accountMovements.filter((m) => !contributionTxIds.has(m.tx.id));
  }, [accountMovements, contributions]);

  const periods = useMemo(
    () => sumAccountPeriodDeltas(accountMovements.map((m) => ({ date: m.tx.date, delta: m.delta }))),
    [accountMovements]
  );

  /** Внески, що прийшли переказом з іншого рахунку — лише вони «з рахунку». */
  const transferBackedContribIds = useMemo(() => {
    const byId = new Map(transactions.map((tx) => [tx.id, tx]));
    const ids = new Set<string>();
    for (const c of contributions) {
      if (c.transactionId && byId.get(c.transactionId)?.type === 'transfer') ids.add(c.id);
    }
    return ids;
  }, [transactions, contributions]);

  const formatForecast = useCallback(
    (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
    [locale]
  );

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
    try {
      await addContribution(id, {
        amount: n,
        date: localIsoDate(),
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
      } else if (code === 'GOAL_ARCHIVED') {
        setActionError(t('goals', 'goalArchivedError'));
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
      <div className={styles.container} aria-busy="true" aria-label={t('common', 'loading')}>
        <header className={styles.header}>
          <button type="button" className={styles.back} onClick={goBack}>
            ← {t('goals', 'title')}
          </button>
        </header>
        <div className={hero.skeletonHero} aria-hidden="true">
          <div className={hero.skeletonTop}>
            <div className={hero.skeletonIcon} />
            <div className={hero.skeletonHeadings}>
              <div className={hero.skeletonEyebrow} />
              <div className={hero.skeletonTitle} />
            </div>
          </div>
          <div className={hero.skeletonAmount} />
          <div className={hero.skeletonBar} />
        </div>
        <div className={hero.skeletonBanner} aria-hidden="true" />
        <div className={hero.statRow} aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${hero.statTile} ${hero.skeletonTile}`} />
          ))}
        </div>
      </div>
    );
  }

  // `pace` виводиться з `goal`, тож існує рівно тоді, коли існує ціль — але
  // типам це неочевидно, тож перевіряємо разом.
  if (error || !goal || !pace) {
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
  const isIncome = goal.type === 'income';
  const showNeededPerDay = pace.phase === 'running' && pace.daysLeft !== null && pace.daysLeft > 0;

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

      {goal.saved < 0 ? (
        <div className={hero.overdrawn} role="alert">
          <TriangleAlert size={16} strokeWidth={2.4} aria-hidden="true" />
          <span>
            {t('goals', 'goalOverdrawn').replace('{amount}', formatCurrency(Math.abs(goal.saved), locale, cur))}
          </span>
        </div>
      ) : null}

      <div className={`${hero.hero} ${isIncome ? '' : hero.heroSavings}`}>
        <div className={hero.heroTop}>
          <div
            className={hero.heroIconWrap}
            style={isIncome ? undefined : { backgroundColor: `${goal.color}22`, color: goal.color }}
          >
            {isIncome ? <Rocket size={22} strokeWidth={2} /> : <GoalIcon name={goal.icon} color="currentColor" size={22} />}
          </div>
          <div className={hero.heroHeadings}>
            <p className={hero.heroEyebrow}>{isIncome ? t('goals', 'roadTo') : t('goals', 'savingUpFor')}</p>
            <h1 className={hero.heroTitle}>{goal.name}</h1>
          </div>
        </div>
        {pct >= 100 || goal.archived ? (
          <div className={`${styles.badgeRow} ${hero.heroBadges}`}>
            {pct >= 100 ? <span className={`${styles.badge} ${styles.badgeDone}`}>{t('goals', 'completed')}</span> : null}
            {goal.archived ? <span className={styles.badge}>{t('goals', 'archived')}</span> : null}
          </div>
        ) : null}
        <div className={hero.amountRow}>
          {/* Саме тут потрібен знак: `formatCurrency` його не малює, і баланс
              у мінусі читався як зароблена сума. */}
          <span className={hero.amountCurrent}>{formatSignedCurrency(goal.saved, locale, cur)}</span>
          <span className={hero.amountTarget}>/ {formatCurrency(goal.targetAmount, locale, cur)}</span>
          {isIncome ? null : (
            <button
              type="button"
              className={hero.heroImageBtn}
              onClick={() => setResultScope('total')}
              aria-label={t('goals', 'goalResultImage')}
              title={t('goals', 'goalResultImage')}
            >
              <ImageDown size={17} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>
        <div
          className={hero.progressTrack}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={goal.name}
        >
          <div
            className={hero.progressFill}
            style={{ width: `${pct}%`, ...(isIncome ? {} : { background: fill }) }}
          />
        </div>
        <div className={hero.progressMeta}>
          <span className={hero.progressPct}>{pace.rawPct.toFixed(1)}%</span>
          {pace.phase === 'running' && days !== null ? (
            <span className={hero.progressDays}>
              {t('goals', 'daysLeft').replace('{n}', String(Math.max(0, days)))}
            </span>
          ) : pace.phase === 'expired' ? (
            <span className={hero.progressDays}>{t('goals', 'overdue')}</span>
          ) : goal.deadline ? (
            <span className={hero.progressDays}>
              {new Date(`${goal.deadline}T12:00:00`).toLocaleDateString(locale)}
            </span>
          ) : null}
        </div>
      </div>

      {pace.phase === 'done' ? (
        <div className={`${hero.trajectory} ${hero.trajectoryAhead}`}>
          <div className={hero.trajectoryIcon}>
            <Trophy size={17} strokeWidth={2.4} />
          </div>
          <div className={hero.trajectoryBody}>
            <p className={hero.trajectoryTitle}>
              {pace.reachedInDays !== null
                ? t('goals', 'goalReachedInDays').replace('{n}', String(pace.reachedInDays))
                : t('goals', 'goalReached')}
            </p>
            <p className={hero.trajectorySub}>
              {pace.overachieved > 0
                ? t('goals', 'goalOverachieved').replace('{amount}', formatCurrency(pace.overachieved, locale, cur))
                : t('goals', 'goalReachedHint')}
            </p>
          </div>
        </div>
      ) : pace.phase === 'expired' ? (
        <div className={`${hero.trajectory} ${hero.trajectoryNeutral}`}>
          <div className={hero.trajectoryIcon}>
            <CalendarX size={17} strokeWidth={2.4} />
          </div>
          <div className={hero.trajectoryBody}>
            <p className={hero.trajectoryTitle}>{t('goals', 'deadlinePassed')}</p>
            <p className={hero.trajectorySub}>
              {t('goals', 'deadlinePassedHint')
                .replace('{amount}', formatCurrency(goal.saved, locale, cur))
                .replace('{target}', formatCurrency(goal.targetAmount, locale, cur))
                .replace('{pct}', pace.rawPct.toFixed(1))
                .replace('{n}', String(pace.totalDays ?? 0))}
            </p>
          </div>
        </div>
      ) : pace.forecastDate ? (
        // Замість оцінки «попереду/відстаєш» — нейтральний орієнтир, куди веде
        // поточний темп. Докір за відставання від графіка користі не давав.
        <div className={`${hero.trajectory} ${hero.trajectoryNeutral}`}>
          <div className={hero.trajectoryIcon}>
            <TrendingUp size={17} strokeWidth={2.4} />
          </div>
          <div className={hero.trajectoryBody}>
            <p className={hero.trajectoryTitle}>
              {t('goals', 'forecastTitle').replace('{date}', formatForecast(pace.forecastDate))}
            </p>
            <p className={hero.trajectorySub}>
              {t('goals', 'forecastHint').replace('{amount}', formatCurrency(pace.actualPerDay, locale, cur))}
            </p>
          </div>
        </div>
      ) : null}

      {goal.archived ? (
        <div className={hero.archivedNote}>
          <Archive size={15} strokeWidth={2.2} aria-hidden="true" />
          <span>{t('goals', 'archivedNoContribute')}</span>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={`${styles.actionBtn} ${styles.actionPrimary}`} onClick={openContribute}>
            <Plus size={20} strokeWidth={2.4} />
            {t('goals', 'contribute')}
          </button>
        </div>
      )}

      <div className={hero.statRow}>
        {isIncome ? (
          <>
            <button
              type="button"
              className={`${hero.statTile} ${hero.statTileTappable}`}
              onClick={() => setResultScope('today')}
            >
              <span className={hero.statValue}>{formatDeltaCurrency(periods.today, locale, cur)}</span>
              <span className={hero.statLabel}>{t('goals', 'movedToday')}</span>
              <ImageDown className={hero.statTileGlyph} size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${hero.statTile} ${hero.statTileTappable}`}
              onClick={() => setResultScope('month')}
            >
              <span className={hero.statValue}>{formatDeltaCurrency(periods.month, locale, cur)}</span>
              <span className={hero.statLabel}>{t('goals', 'movedMonth')}</span>
              <ImageDown className={hero.statTileGlyph} size={13} aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <div className={hero.statTile}>
              <span className={hero.statValue}>{formatCurrency(pace.remaining, locale, cur)}</span>
              <span className={hero.statLabel}>{t('goals', 'remaining')}</span>
            </div>
            <div className={hero.statTile}>
              <span className={hero.statValue}>
                {pace.forecastDate ? formatForecast(pace.forecastDate) : '—'}
              </span>
              <span className={hero.statLabel}>{t('goals', 'forecastLabel')}</span>
            </div>
          </>
        )}
        <div className={hero.statTile}>
          {/* Денна норма має сенс лише коли є дедлайн, на який її ділити. Без
              нього вона дорівнює залишку — тобто дублювала б сусідню плитку,
              тож там доречніший фактичний темп. */}
          <span className={hero.statValue}>
            {formatCurrency(showNeededPerDay ? pace.neededPerDay : pace.actualPerDay, locale, cur)}
          </span>
          <span className={hero.statLabel}>
            {showNeededPerDay ? t('goals', 'neededPerDay') : t('goals', 'actualPerDay')}
          </span>
        </div>
      </div>

      {sources.length > 0
        ? (() => {
            const total = sources.reduce((a, b) => a + b.amount, 0);
            return (
              <>
                <h2 className={hero.sectionTitle}>{t('goals', 'incomeSources')}</h2>
                <div className={hero.sourceList}>
                  {sources.map((s, idx) => {
                    const share = total > 0 ? (s.amount / total) * 100 : 0;
                    const color = SOURCE_PALETTE[idx % SOURCE_PALETTE.length];
                    return (
                      <div key={s.name} className={hero.sourceCard}>
                        <div className={hero.sourceTop}>
                          <div className={hero.sourceIcon} style={{ background: color }}>
                            <Tag size={14} strokeWidth={2.2} />
                          </div>
                          <span className={hero.sourceName}>{s.name}</span>
                          <span className={hero.sourceAmount}>{formatCurrency(s.amount, locale, cur)}</span>
                          <span className={hero.sourceSharePct}>{Math.round(share)}%</span>
                        </div>
                        <div className={hero.sourceBarTrack}>
                          <div className={hero.sourceBarFill} style={{ width: `${share}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()
        : null}

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
                  {transferBackedContribIds.has(c.id) ? (
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

      {otherMovements.length > 0 ? (
        <>
          <h2 className={styles.sectionTitle}>{t('goals', 'accountMovements')}</h2>
          <p className={styles.sectionHint}>{t('goals', 'accountMovementsHint')}</p>
          <div className={styles.contribList}>
            {otherMovements.map(({ tx, rawDelta, rawCurrency }) => {
              const preview = getTransactionNotePreview(tx);
              const incoming = rawDelta >= 0;
              return (
                <div key={tx.id} className={styles.contribRow}>
                  <div className={styles.contribMain}>
                    <div className={styles.contribDate}>{new Date(tx.date).toLocaleDateString(locale)}</div>
                    {preview ? <p className={styles.contribNote}>{preview}</p> : null}
                  </div>
                  <span className={`${styles.contribAmt} ${incoming ? styles.amountIn : styles.amountOut}`}>
                    {formatDeltaCurrency(rawDelta, locale, rawCurrency as DisplayCurrency)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      <GoalResultCardSheet
        open={resultScope !== null}
        onClose={() => setResultScope(null)}
        goal={goal}
        scope={resultScope ?? 'total'}
        periodEarned={resultScope === 'month' ? periods.month : periods.today}
        previousEarned={resultScope === 'month' ? periods.prevMonth : periods.yesterday}
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
