import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { deleteMerchantRule, getMerchantRules, updateMerchantRule, type MerchantRule } from '../../api/client';
import { useCategoryCatalog } from '../../hooks/useCategoryCatalog';
import { useToast } from '../ui/Toast';
import { hapticLight } from '../../utils/notify';
import SettingsSection from './SettingsSection';
import styles from './MerchantRulesSection.module.css';

/**
 * Запамʼятовані магазини: чого людина навчила бота, виправивши категорію на
 * картці операції в Telegram.
 *
 * Досі це правило було видно лише за наслідками: випадковий тап по
 * «Транспорт» для Żabka тихо відправляв туди кожну наступну покупку, і
 * виправити це можна було тільки новою покупкою там же. Тут його видно,
 * можна змінити категорію або забути магазин зовсім — тоді він знову
 * вгадуватиметься списком мереж чи кодом закладу.
 */
const MerchantRulesSection: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const expenseCatalog = useCategoryCatalog('expense');
  const incomeCatalog = useCategoryCatalog('income');
  const [rules, setRules] = useState<MerchantRule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMerchantRules()
      .then((rows) => {
        if (!cancelled) setRules(rows);
      })
      .catch(() => {
        // Мережа: секція просто не покажеться, решта налаштувань жива.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const incomeIds = useMemo(() => new Set(incomeCatalog.categories.map((c) => c.id)), [incomeCatalog.categories]);

  const handleChange = async (rule: MerchantRule, categoryId: string) => {
    if (!categoryId || categoryId === rule.categoryId || busyKey) return;
    setBusyKey(rule.merchantKey);
    try {
      setRules(await updateMerchantRule(rule.merchantKey, categoryId));
      hapticLight();
      toast.show(t('settings', 'merchantRulesSaved'));
    } catch {
      toast.show(t('settings', 'saveFailed'), { variant: 'error' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async (rule: MerchantRule) => {
    if (busyKey) return;
    setBusyKey(rule.merchantKey);
    try {
      setRules(await deleteMerchantRule(rule.merchantKey));
      hapticLight();
      toast.show(t('settings', 'merchantRulesDeleted'));
    } catch {
      toast.show(t('settings', 'saveFailed'), { variant: 'error' });
    } finally {
      setBusyKey(null);
    }
  };

  if (!loaded) return null;

  return (
    <SettingsSection label={t('settings', 'merchantRulesTitle')} description={t('settings', 'merchantRulesDescription')}>
      {rules.length === 0 ? <p className={styles.empty}>{t('settings', 'merchantRulesEmpty')}</p> : null}
      {rules.map((rule) => {
        // Доходу — категорії доходів, витраті — витрат: правило для зарплати
        // не має пропонувати «Продукти».
        const isIncome = incomeIds.has(rule.categoryId);
        const options = isIncome ? incomeCatalog.categories : expenseCatalog.categories;
        const knownCategory = options.some((c) => c.id === rule.categoryId);
        return (
          <div key={rule.merchantKey} className={styles.row}>
            <span className={styles.merchant} title={rule.label ?? rule.merchantKey}>
              {rule.label ?? rule.merchantKey}
            </span>
            <select
              className={styles.select}
              value={rule.categoryId}
              disabled={busyKey === rule.merchantKey}
              onChange={(e) => void handleChange(rule, e.target.value)}
              aria-label={rule.label ?? rule.merchantKey}
            >
              {/* Категорію могли видалити, а правило лишилось — показуємо, що є. */}
              {!knownCategory ? (
                <option value={rule.categoryId}>{rule.categoryName ?? rule.categoryId}</option>
              ) : null}
              <optgroup label={t('settings', isIncome ? 'merchantRulesIncomeGroup' : 'merchantRulesExpenseGroup')}>
                {options.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => void handleDelete(rule)}
              disabled={busyKey === rule.merchantKey}
              aria-label={t('settings', 'merchantRulesDelete')}
            >
              <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </SettingsSection>
  );
};

export default MerchantRulesSection;
