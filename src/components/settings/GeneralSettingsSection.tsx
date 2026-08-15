import React, { useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { LANGUAGES, LANGUAGE_LABELS, LANGUAGE_FLAGS } from '../../i18n/translations';
import type { Language } from '../../i18n/translations';
import type { DisplayCurrency } from '../../utils/formatters';
import { useTelegramFullscreen } from '../../hooks/useTelegramFullscreen';
import { hapticLight } from '../../utils/notify';
import Switch from '../ui/Switch';
import OptionPickerSheet from '../ui/OptionPickerSheet';
import SettingsSection from './SettingsSection';
import SettingsRow from './SettingsRow';

const DISPLAY_CURRENCIES: DisplayCurrency[] = ['UAH', 'PLN', 'USD'];

const currencyLabelKey = (currency: DisplayCurrency): 'currencyUah' | 'currencyPln' | 'currencyUsd' =>
  currency === 'USD' ? 'currencyUsd' : currency === 'PLN' ? 'currencyPln' : 'currencyUah';

const GeneralSettingsSection: React.FC = () => {
  const {
    t,
    language,
    setLanguage,
    displayCurrency,
    setDisplayCurrency,
    moneyHidden,
    setMoneyHidden,
  } = useTranslation();
  const { isSupported: fsSupported, isFullscreen, toggle: toggleFullscreen } = useTelegramFullscreen();

  const [langSheetOpen, setLangSheetOpen] = useState(false);
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false);

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
          label={t('settings', 'hideMoney')}
          sublabel={t('settings', 'hideMoneyDescription')}
          trailing={
            <Switch
              checked={moneyHidden}
              onChange={(next) => {
                setMoneyHidden(next);
                hapticLight();
              }}
              aria-label={t('settings', 'hideMoney')}
            />
          }
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
