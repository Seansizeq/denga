import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { apiFetch, getPlannerSettings, updatePlannerSettings } from '../../api/client';
import OptionPickerSheet, { type PickerOption } from '../ui/OptionPickerSheet';
import SettingsSection from './SettingsSection';
import SettingsRow from './SettingsRow';
import { useSaveSetting } from './useSaveSetting';

type PlannerShiftTemplate = {
  id: string;
  name: string;
  symbol: string;
  salaryCurrency: 'UAH' | 'PLN';
};

const formatTemplateLabel = (tpl: PlannerShiftTemplate): string => {
  const name = tpl.name.trim();
  const symbol = tpl.symbol.trim();
  const base = name && symbol ? `${name} \u00b7 ${symbol}` : name || symbol || tpl.id;
  return `${base} ${tpl.salaryCurrency === 'PLN' ? 'z\u0142' : '\u20b4'}`;
};

const SEARCH_THRESHOLD = 5;

const PlannerTemplateSection: React.FC = () => {
  const { t } = useTranslation();
  const { saving, run } = useSaveSetting();
  const [templates, setTemplates] = useState<PlannerShiftTemplate[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [settings, res] = await Promise.all([
          getPlannerSettings(),
          apiFetch('/api/planner/shift-templates'),
        ]);
        if (cancelled) return;
        setDefaultId(settings.defaultShiftTemplateId ?? null);
        if (res.ok) {
          const rows = (await res.json()) as PlannerShiftTemplate[];
          setTemplates(Array.isArray(rows) ? rows : []);
        }
      } catch {
        // ignore temporary network issues
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo<PickerOption[]>(
    () => [
      { id: '', label: t('planner', 'defaultShiftTemplateAsk') },
      { id: 'none', label: t('planner', 'defaultShiftTemplateWithout') },
      ...templates.map((tpl) => ({ id: tpl.id, label: formatTemplateLabel(tpl) })),
    ],
    [templates, t],
  );

  const selectedId = defaultId ?? '';
  const currentLabel =
    options.find((option) => option.id === selectedId)?.label ?? t('planner', 'defaultShiftTemplateAsk');

  const handleSelect = (id: string) => {
    setSheetOpen(false);
    const next = id === '' ? null : id;
    void run(
      () => updatePlannerSettings({ defaultShiftTemplateId: next }),
      (settings) => setDefaultId(settings.defaultShiftTemplateId ?? null),
      { errorMessage: t('planner', 'defaultShiftTemplateSaveFailed') },
    );
  };

  return (
    <SettingsSection
      label={t('settings', 'sectionPlanner')}
      description={
        templates.length === 0
          ? t('planner', 'defaultShiftTemplateNoTemplates')
          : t('planner', 'defaultShiftTemplateHint')
      }
    >
      <SettingsRow
        label={t('planner', 'defaultShiftTemplate')}
        value={currentLabel}
        chevron
        disabled={saving}
        onClick={() => setSheetOpen(true)}
      />
      <OptionPickerSheet
        open={sheetOpen}
        title={t('planner', 'defaultShiftTemplate')}
        closeLabel={t('addTx', 'cancel')}
        options={options}
        selectedId={selectedId}
        onSelect={handleSelect}
        onClose={() => setSheetOpen(false)}
        searchable={templates.length > SEARCH_THRESHOLD}
      />
    </SettingsSection>
  );
};

export default PlannerTemplateSection;
