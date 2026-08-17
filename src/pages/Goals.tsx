import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil } from 'lucide-react';
import {
  createGoal,
  deleteGoal,
  getGoals,
  updateGoal,
  type Goal,
  type GoalCurrency,
  type GoalType,
} from '../api/client';
import { showAppConfirm } from '../utils/notify';
import { formatCurrency, formatSignedCurrency } from '../utils/formatters';
import type { DisplayCurrency } from '../utils/formatters';
import { localIsoDate } from '../utils/dateRanges';
import { deadlineDeltaDays, fillColorForPct, progressPct } from '../utils/goals';
import { useTranslation } from '../i18n/LanguageContext';
import { useGoBack } from '../hooks/useGoBack';
import FormSheet from '../components/ui/FormSheet';
import GoalIcon, { ICON_KEYS, toGoalIconKey, type GoalIconKey } from '../components/goals/GoalIcon';
import sheet from '../components/ui/FormSheet.module.css';
import styles from './Goals.module.css';

const SWATCHES = ['#7C5CFF', '#22c55e', '#06b6d4', '#eab308', '#f97316', '#ec4899'] as const;
const GOAL_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const Goals: React.FC = () => {
  const navigate = useNavigate();
  const goBack = useGoBack('/');
  const { t, locale, displayCurrency } = useTranslation();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  /** null — створення нової цілі, інакше редагування наявної. */
  const [editing, setEditing] = useState<Goal | null>(null);
  const [archived, setArchived] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>('savings');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [baseline, setBaseline] = useState('');
  const [currency, setCurrency] = useState<GoalCurrency>(displayCurrency as GoalCurrency);
  const [deadline, setDeadline] = useState('');
  const [color, setColor] = useState<string>(SWATCHES[0]);
  const [iconKey, setIconKey] = useState<GoalIconKey>('target');
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
    setEditing(null);
    setArchived(false);
    setGoalType('savings');
    setName('');
    setTarget('');
    setBaseline('');
    setCurrency(displayCurrency as GoalCurrency);
    setDeadline('');
    setColor(SWATCHES[0]);
    setIconKey('target');
    setSheetOpen(true);
  };

  const openEditSheet = (g: Goal) => {
    setSaveError('');
    setEditing(g);
    setArchived(g.archived);
    setGoalType(g.type);
    setName(g.name);
    setTarget(String(g.targetAmount));
    setBaseline(g.baselineAmount > 0 ? String(g.baselineAmount) : '');
    setCurrency(g.currency);
    setDeadline(g.deadline ?? '');
    setColor(GOAL_COLOR_RE.test(g.color) ? g.color : SWATCHES[0]);
    setIconKey(toGoalIconKey(g.icon));
    setSheetOpen(true);
  };

  // Нова ціль не може стартувати в минулому; наявна лишає свій дедлайн, і
  // межа для неї — день створення, інакше забіг вийшов би від'ємної довжини.
  const deadlineFloor = editing ? String(editing.createdAt).slice(0, 10) : localIsoDate();
  const deadlineMissing = goalType === 'income' && !deadline.trim();
  const deadlineTooEarly = Boolean(deadline.trim()) && deadline < deadlineFloor;

  const onSubmitSheet = async () => {
    setSaveError('');
    const n = parseFloat(String(target).replace(',', '.'));
    if (!name.trim() || !Number.isFinite(n) || n <= 0) return;
    if (deadlineMissing) {
      setSaveError(t('goals', 'deadlineRequiredForIncome'));
      return;
    }
    if (deadlineTooEarly) {
      setSaveError(t('goals', editing ? 'deadlineBeforeStart' : 'deadlineInPast'));
      return;
    }
    const base = parseFloat(String(baseline).replace(',', '.'));
    const payload = {
      name: name.trim(),
      targetAmount: n,
      baselineAmount: Number.isFinite(base) && base > 0 ? base : 0,
      currency,
      deadline: deadline.trim() || null,
      color,
      icon: iconKey,
    };
    try {
      if (editing) await updateGoal(editing.id, { ...payload, archived });
      else await createGoal({ ...payload, type: goalType });
      setSheetOpen(false);
      await load();
    } catch {
      setSaveError(t('goals', 'saveError'));
    }
  };

  const onDeleteFromSheet = async () => {
    if (!editing) return;
    if (!(await showAppConfirm(t('goals', 'deleteConfirm')))) return;
    try {
      await deleteGoal(editing.id);
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
      <div key={g.id} className={styles.goalCardWrap}>
        <button
          type="button"
          className={styles.goalCardEdit}
          onClick={() => openEditSheet(g)}
          aria-label={`${t('goals', 'edit')}: ${g.name}`}
        >
          <Pencil size={16} strokeWidth={2.2} />
        </button>
        <button
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
            {formatSignedCurrency(g.saved, locale, g.currency as DisplayCurrency)} /{' '}
            {formatCurrency(g.targetAmount, locale, g.currency as DisplayCurrency)}
          </span>
          <span className={styles.meta}>{Math.round(pct)}%</span>
        </div>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={g.name}
        >
          <div className={styles.progressFill} style={{ width: `${pct}%`, background: fill }} />
        </div>
          {deadlineLabel && g.deadline ? (
            <p className={styles.meta}>
              {t('goals', 'deadline')}: {new Date(g.deadline + 'T12:00:00').toLocaleDateString(locale)} — {deadlineLabel}
            </p>
          ) : null}
        </button>
      </div>
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
        <div className={styles.list} aria-busy="true" aria-label={t('common', 'loading')}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.skeletonCard} aria-hidden="true">
              <div className={styles.skeletonTop}>
                <div className={styles.skeletonIcon} />
                <div className={styles.skeletonTitle} />
              </div>
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonBar} />
            </div>
          ))}
        </div>
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
          title={editing ? t('goals', 'edit') : t('goals', 'addGoal')}
          onClose={() => setSheetOpen(false)}
          onSubmit={() => void onSubmitSheet()}
          submitLabel={t('goals', 'save')}
          cancelLabel={t('goals', 'cancel')}
          submitDisabled={
            !name.trim() || !(Number(target.replace(',', '.')) > 0) || deadlineMissing || deadlineTooEarly
          }
          error={saveError || undefined}
        >
          <div className={sheet.heroCard} style={{ backgroundColor: color }}>
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

          {editing ? (
            <div className={sheet.segment} role="group" aria-label={t('goals', 'goalState')}>
              <button
                type="button"
                className={sheet.segmentBtn}
                aria-pressed={!archived}
                onClick={() => setArchived(false)}
              >
                {t('goals', 'stateActive')}
              </button>
              <button
                type="button"
                className={sheet.segmentBtn}
                aria-pressed={archived}
                onClick={() => setArchived(true)}
              >
                {t('goals', 'archived')}
              </button>
            </div>
          ) : (
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
          )}

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
              <span className={sheet.rowLabel}>
                {goalType === 'income' ? t('goals', 'baselineEarned') : t('goals', 'baselineSaved')}
              </span>
              <input
                className={sheet.rowField}
                inputMode="decimal"
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
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
                min={deadlineFloor}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
          </div>
          <p className={sheet.groupCaption}>
            {goalType === 'income' ? t('goals', 'baselineIncomeHint') : t('goals', 'baselineSavingsHint')}{' '}
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

          {editing ? (
            <button type="button" className={sheet.deleteRow} onClick={() => void onDeleteFromSheet()}>
              {t('goals', 'delete')}
            </button>
          ) : null}
        </FormSheet>
      ) : null}
    </div>
  );
};

export default Goals;
