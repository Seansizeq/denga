import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { LANGUAGES, LANGUAGE_LABELS, LANGUAGE_FLAGS } from '../../i18n/translations';
import type { Language } from '../../i18n/translations';
import type { DisplayCurrency } from '../../utils/formatters';
import { formatFxSummary, formatFxUpdatedAt } from '../../utils/formatFxRates';
import { useTelegramFullscreen } from '../../hooks/useTelegramFullscreen';
import { hapticLight } from '../../utils/notify';
import Switch from '../ui/Switch';
import OptionPickerSheet from '../ui/OptionPickerSheet';
import SettingsSection from './SettingsSection';
import SettingsRow from './SettingsRow';
import styles from './GeneralSettingsSection.module.css';

const DISPLAY_CURRENCIES: DisplayCurrency[] = ['UAH', 'PLN', 'USD'];

const currencyLabelKey = (currency: DisplayCurrency): 'currencyUah' | 'currencyPln' | 'currencyUsd' =>
  currency === 'USD' ? 'currencyUsd' : currency === 'PLN' ? 'currencyPln' : 'currencyUah';

const GeneralSettingsSection: React.FC = () => {
  const {
    t,
    locale,
    language,
    setLanguage,
    displayCurrency,
    setDisplayCurrency,
    fxRates,
    fxStatus,
    refreshFxRates,
  } = useTranslation();
  const { isSupported: fsSupported, isFullscreen, toggle: toggleFullscreen } = useTelegramFullscreen();

  const [langSheetOpen, setLangSheetOpen] = useState(false);
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fxSummary = formatFxSummary(fxRates, displayCurrency);
  const fxStatusLabel =
    fxStatus === 'live'
      ? t('settings', 'fxLive')
      : fxStatus === 'cache'
        ? t('settings', 'fxCache')
        : t('settings', 'fxFallback');

  const handleRefresh = async () => {
    setRefreshing(true);
    hapticLight();
    try {
      await refreshFxRates();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <SettingsSection label={t('settings', 'sectionGeneral')} description={t('settings', 'languageDescription')}>
        <SettingsRow
          label={t('settings', 'language')}
          leading={LANGUAGE_FLAGS[language]}
          value={LANGUAGE_LABELS[language]}
          chevron
          onClick={() => setLangSheetOpen(true)}
        />
        <SettingsRow
          label={t('settings', 'currency')}
          value={t('settings', currencyLabelKey(displayCurrency))}
          chevron
          onClick={() => setCurrencySheetOpen(true)}
        />
        <SettingsRow
          label={t('settings', 'fullscreen')}
          sublabel={fsSupported ? undefined : t('settings', 'fullscreenUnsupported')}
          trailing={
            <Switch
              checked={isFullscreen}
              onChange={() => toggleFullscreen()}
              disabled={!fsSupported}
              aria-label={t('settings', 'fullscreen')}
            />
          }
        />
      </SettingsSection>

      <SettingsSection label={t('settings', 'fxSummaryTitle')}>
        {fxSummary.map((line) => (
          <SettingsRow key={line.from} label={line.lead} value={line.rate} />
        ))}
        <SettingsRow
          label={t('settings', 'fxUpdatedAt')}
          value={`${formatFxUpdatedAt(fxRates, locale)} \u00b7 ${fxStatusLabel}`}
        />
        <SettingsRow
          label={t('settings', 'fxRefresh')}
          emphasis
          disabled={refreshing}
          onClick={() => void handleRefresh()}
          trailing={
            <RefreshCw
              size={18}
              strokeWidth={2}
              className={`${styles.refreshIcon} ${refreshing ? styles.refreshing : ''}`}
            />
          }
        />
      </SettingsSection>

      <OptionPickerSheet
        open={langSheetOpen}
        title={t('settings', 'language')}
        closeLabel={t('addTx', 'cancel')}
        selectedId={language}
        options={LANGUAGES.map((lng: Language) => ({
          id: lng,
          label: LANGUAGE_LABELS[lng],
          leading: LANGUAGE_FLAGS[lng],
        }))}
        onSelect={(id) => {
          setLanguage(id as Language);
          hapticLight();
          setLangSheetOpen(false);
        }}
        onClose={() => setLangSheetOpen(false)}
      />

      <OptionPickerSheet
        open={currencySheetOpen}
        title={t('settings', 'currency')}
        closeLabel={t('addTx', 'cancel')}
        selectedId={displayCurrency}
        options={DISPLAY_CURRENCIES.map((currency) => ({
          id: currency,
          label: t('settings', currencyLabelKey(currency)),
        }))}
        onSelect={(id) => {
          setDisplayCurrency(id as DisplayCurrency);
          hapticLight();
          setCurrencySheetOpen(false);
        }}
        onClose={() => setCurrencySheetOpen(false)}
      />
    </>
  );
};

export default GeneralSettingsSection;
