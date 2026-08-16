import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LoaderCircle, RefreshCw, Share2 } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';
import { useTranslation } from '../../i18n/LanguageContext';
import { useToast } from '../ui/Toast';
import { formatSignedCurrency } from '../../utils/formatters';
import type { StatsRange } from '../../utils/statsPeriod';
import {
  calculateResultChange,
  getResultCardTemplates,
  getResultCardTemplateUrl,
  renderResultCardPng,
  selectResultCardGroup,
  stableResultCardIndex,
} from '../../utils/resultCard';
import styles from './ResultCardSheet.module.css';

interface ResultCardSheetProps {
  open: boolean;
  onClose: () => void;
  range: StatsRange;
  periodLabel: string;
  currentNet: number;
  previousNet: number;
}

const safeFilePart = (value: string): string =>
  value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'result';

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const ResultCardSheet: React.FC<ResultCardSheetProps> = ({
  open,
  onClose,
  range,
  periodLabel,
  currentNet,
  previousNet,
}) => {
  const { t, locale, displayCurrency } = useTranslation();
  const toast = useToast();
  const group = useMemo(
    () => selectResultCardGroup(range, currentNet, previousNet),
    [range, currentNet, previousNet],
  );
  const templates = getResultCardTemplates(group);
  const [templateIndex, setTemplateIndex] = useState(() => stableResultCardIndex(group, periodLabel));
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const title = useMemo(() => {
    if (range === 'today') return t('stats', 'resultDay');
    if (range === 'week') return t('stats', 'resultWeek');
    if (range === 'month') return t('stats', 'resultMonth');
    return t('stats', 'resultYear');
  }, [range, t]);

  const comparison = useMemo(() => {
    const change = calculateResultChange(currentNet, previousNet);
    if (change === null) return t('stats', 'noPreviousComparison');
    const rounded = Math.round(change);
    const sign = rounded > 0 ? '+' : '';
    return `${sign}${rounded}% ${t('stats', 'vsPreviousShort')}`;
  }, [currentNet, previousNet, t]);

  useEffect(() => {
    if (!open) return;
    setTemplateIndex(stableResultCardIndex(group, periodLabel));
  }, [open, group, periodLabel]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let nextUrl: string | null = null;
    setBlob(null);
    setPreviewUrl(null);
    setError(false);

    void renderResultCardPng({
      templateUrl: getResultCardTemplateUrl(group, templateIndex),
      title,
      amount: formatSignedCurrency(currentNet, locale, displayCurrency),
      comparison,
      period: periodLabel,
    })
      .then((nextBlob) => {
        if (cancelled) return;
        nextUrl = URL.createObjectURL(nextBlob);
        setBlob(nextBlob);
        setPreviewUrl(nextUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [open, group, templateIndex, title, currentNet, locale, displayCurrency, comparison, periodLabel]);

  const showNextTemplate = useCallback(() => {
    setTemplateIndex((current) => (current + 1) % templates.length);
  }, [templates.length]);

  const shareOrDownload = useCallback(async () => {
    if (!blob) return;
    const filename = `denga-${range}-${safeFilePart(periodLabel)}.png`;
    const file = new File([blob], filename, { type: 'image/png' });

    try {
      const canShareFile = typeof navigator.share === 'function'
        && (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }));
      if (canShareFile) {
        await navigator.share({ files: [file], title });
        return;
      }
      downloadBlob(blob, filename);
      toast.show(t('stats', 'imageSaved'));
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      toast.show(t('stats', 'imageSaveError'), { variant: 'error' });
    }
  }, [blob, periodLabel, range, title, toast, t]);

  return (
    <BottomSheet open={open} title={t('stats', 'resultImageTitle')} onClose={onClose}>
      <div className={styles.previewWrap}>
        <div className={styles.preview}>
          {previewUrl && !error ? (
            <img className={styles.previewImage} src={previewUrl} alt={title} />
          ) : (
            <div className={styles.loading}>
              {error ? null : <LoaderCircle className={styles.spinner} size={26} aria-label={t('stats', 'preparingImage')} />}
            </div>
          )}
        </div>

        {error ? <p className={styles.error}>{t('stats', 'imageSaveError')}</p> : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.secondaryButton}`}
            onClick={showNextTemplate}
            disabled={!blob || error}
          >
            <RefreshCw size={17} />
            {t('stats', 'nextDesign')}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primaryButton}`}
            onClick={() => void shareOrDownload()}
            disabled={!blob || error}
          >
            <Share2 size={17} />
            {t('stats', 'saveOrShare')}
          </button>
        </div>
        <p className={styles.caption}>{t('stats', 'resultImageCaption')}</p>
      </div>
    </BottomSheet>
  );
};

export default ResultCardSheet;
