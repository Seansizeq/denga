import React, { useEffect, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import {
  getPlannerAutomation,
  getPlannerSettings,
  rotatePlannerAutomationToken,
  type PlannerAutomation,
} from '../../api/client';
import { useToast } from '../ui/Toast';
import { hapticLight } from '../../utils/notify';
import SettingsSection from './SettingsSection';
import styles from './PlannerAutomationSection.module.css';

const maskUrl = (url: string): string => url.replace(/(token=.{6}).+$/, '$1…');

// Older Android WebViews inside Telegram ship without the async Clipboard API.
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  }
};

const PlannerAutomationSection: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const [automation, setAutomation] = useState<PlannerAutomation | null>(null);
  const [hasDefaultTemplate, setHasDefaultTemplate] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [auto, settings] = await Promise.all([getPlannerAutomation(), getPlannerSettings()]);
        if (cancelled) return;
        setAutomation(auto);
        setHasDefaultTemplate(Boolean(settings.defaultShiftTemplateId));
      } catch {
        // ignore temporary network issues
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopy = async (url: string) => {
    if (await copyToClipboard(url)) {
      hapticLight();
      toast.show(t('settings', 'automationCopied'));
      return;
    }
    toast.show(t('settings', 'automationCopyFailed'), { variant: 'error' });
  };

  const handleRotate = async () => {
    setRotating(true);
    try {
      const next = await rotatePlannerAutomationToken();
      setAutomation(next);
      setConfirming(false);
      hapticLight();
      toast.show(t('settings', 'saved'));
    } catch {
      toast.show(t('settings', 'saveFailed'), { variant: 'error' });
    } finally {
      setRotating(false);
    }
  };

  if (!automation) return null;

  return (
    <SettingsSection
      label={t('settings', 'automationGeoTitle')}
      description={t('settings', 'automationGeoDescription')}
    >
      {!hasDefaultTemplate ? (
        <p className={styles.warning}>{t('settings', 'automationNoTemplate')}</p>
      ) : null}

      {([
        ['automationStartUrl', automation.startUrl],
        ['automationEndUrl', automation.endUrl],
      ] as const).map(([labelKey, url]) => (
        <button key={labelKey} type="button" className={styles.linkRow} onClick={() => void handleCopy(url)}>
          <span className={styles.linkLabels}>
            <span className={styles.linkLabel}>{t('settings', labelKey)}</span>
            <span className={styles.linkValue}>{maskUrl(url)}</span>
          </span>
          <Copy size={18} strokeWidth={2} className={styles.copyIcon} aria-hidden="true" />
        </button>
      ))}

      <div className={styles.howTo}>
        <p className={styles.howToLine}>{t('settings', 'automationHowToIos')}</p>
        <p className={styles.howToLine}>{t('settings', 'automationHowToAndroid')}</p>
      </div>

      {!confirming ? (
        <button type="button" className={styles.rotateRow} onClick={() => setConfirming(true)}>
          <RefreshCw size={18} strokeWidth={2} aria-hidden="true" />
          {t('settings', 'automationRotate')}
        </button>
      ) : (
        <div className={styles.confirmBox}>
          <p className={styles.confirmText}>{t('settings', 'automationRotateWarning')}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setConfirming(false)}
              disabled={rotating}
            >
              {t('addTx', 'cancel')}
            </button>
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={() => void handleRotate()}
              disabled={rotating}
            >
              {t('settings', 'automationRotateConfirm')}
            </button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
};

export default PlannerAutomationSection;
