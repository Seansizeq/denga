import React from 'react';
import FormSheet from './FormSheet';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatPlannerMoney } from '../../utils/formatters';
import { formatHoursMinutes, formatTimeRange } from '../../utils/shiftDuration';
import type { ShiftFormTemplate } from './ShiftFormSheet';
import styles from './FormSheet.module.css';
import extra from './ShiftFormSheet.module.css';

interface ShiftTemplatesSheetProps {
  open: boolean;
  templates: ShiftFormTemplate[];
  /** Шаблон, з якого «Почати зміну» стартує без запитань. */
  defaultTemplateId: string | null;
  locale: string;
  onClose: () => void;
  onCreate: () => void;
  onEdit: (template: ShiftFormTemplate) => void;
}

/**
 * Список шаблонів змін — одне місце, де ними керують.
 *
 * Досі шаблони жили в чотирьох місцях і в кожному вміли різне: у шторці дня з
 * них створювали зміну (і там-таки стояв хрестик видалення — впритул до кнопки
 * застосування), в аркуші «Почати зміну» ними стартували, у формі зміни вони
 * підставляли значення, а в налаштуваннях обирався шаблон за замовчуванням.
 * Відредагувати шаблон не можна було ніде, і ніде не було видно, **що в ньому
 * лежить**: ні часу, ні ставки — лише назва.
 *
 * Тут видно вміст кожного, тап відкриває правку, а видалення живе всередині
 * тієї правки — так само, як у зміни. Хрестиків поруч із дією більше немає.
 */
const ShiftTemplatesSheet: React.FC<ShiftTemplatesSheetProps> = ({
  open,
  templates,
  defaultTemplateId,
  locale,
  onClose,
  onCreate,
  onEdit,
}) => {
  const { t } = useTranslation();
  if (!open) return null;

  const describe = (template: ShiftFormTemplate): string => {
    const duration = formatHoursMinutes(template.workedHours, {
      hours: t('planner', 'hoursShort'),
      minutes: t('planner', 'minutesShort'),
    });
    const range = template.isFullDay ? '' : formatTimeRange(template.startTime, template.endTime);
    const pay = template.salaryAmount > 0
      ? formatPlannerMoney(template.salaryAmount, locale, template.salaryCurrency)
      : template.salaryRate > 0
        ? `${formatPlannerMoney(template.salaryRate, locale, template.salaryCurrency)}/${t('planner', 'hoursShort')}`
        : '';
    return [range, duration, pay].filter(Boolean).join(' · ');
  };

  return (
    <FormSheet
      title={t('planner', 'manageTemplates')}
      onClose={onClose}
      onSubmit={onCreate}
      submitLabel={t('planner', 'templateAdd')}
      cancelLabel={t('balance', 'close')}
    >
      {templates.length === 0 ? (
        <p className={styles.groupCaption}>{t('planner', 'templatesEmpty')}</p>
      ) : (
        <div className={styles.group}>
          {templates.map((template) => {
            const title = [template.name.trim(), template.symbol.trim()].filter(Boolean).join(' · ')
              || t('planner', 'shiftTitle');
            return (
              <button
                key={template.id}
                type="button"
                className={`${styles.row} ${styles.rowTappable}`}
                onClick={() => onEdit(template)}
              >
                <span className={extra.templateRowLabels}>
                  <span className={extra.templateRowTitle}>
                    {title}
                    {/* Валюта входить у тотожність шаблону: «Денна ₴» і «Денна zł» —
                        два різні шаблони, і це навмисно, бо буває робота у двох
                        країнах. Без позначки вони виглядали б однаково. */}
                    <span className={extra.templateCurrencyTag}>
                      {template.salaryCurrency === 'PLN' ? 'zł' : '₴'}
                    </span>
                    {template.id === defaultTemplateId ? (
                      <span className={extra.templateDefaultTag}>{t('planner', 'templateDefaultTag')}</span>
                    ) : null}
                  </span>
                  <span className={extra.templateRowMeta}>{describe(template)}</span>
                </span>
                <span className={styles.rowChevron} aria-hidden="true">›</span>
              </button>
            );
          })}
        </div>
      )}
      <p className={styles.groupCaption}>{t('planner', 'templatesHint')}</p>
    </FormSheet>
  );
};

export default ShiftTemplatesSheet;
