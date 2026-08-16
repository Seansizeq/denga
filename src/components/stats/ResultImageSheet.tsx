import React, { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Share2 } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';
import { useTranslation } from '../../i18n/LanguageContext';
import { useToast } from '../ui/Toast';
import {
  getResultCardTemplates,
  getResultCardTemplateUrl,
  renderResultCardPng,
  type ResultCardGroup,
} from '../../utils/resultCard';
import styles from './ResultCardSheet.module.css';

interface ResultImageSheetProps {
  open: boolean;
  onClose: () => void;
  sheetTitle: string;
  imageAlt: string;
  group: ResultCardGroup;
  filenameKey: string;
  /** Дрібний рядок над сумою. */
  label: string;
  amount: string;
  amountColor?: string;
}

const safeFilePart = (value: string): string =>
  value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'result';

/** Шаблон тягнеться наново на кожне відкриття — жодної прив'язки до періоду. */
const randomTemplateIndex = (count: number): number => (count > 0 ? Math.floor(Math.random() * count) : 0);

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

const ResultImageSheet: React.FC<ResultImageSheetProps> = ({
  open,
  onClose,
  sheetTitle,
  imageAlt,
  group,
  filenameKey,
  label,
  amount,
  amountColor,
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const templateCount = getResultCardTemplates(group).length;
  const [templateIndex, setTemplateIndex] = useState(() => randomTemplateIndex(templateCount));
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTemplateIndex(randomTemplateIndex(templateCount));
  }, [open, group, templateCount]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let nextUrl: string | null = null;
    setBlob(null);
    setPreviewUrl(null);
    setError(false);

    void renderResultCardPng({
      templateUrl: getResultCardTemplateUrl(group, templateIndex),
      label,
      amount,
      amountColor,
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
  }, [open, group, templateIndex, label, amount, amountColor]);

  const shareOrDownload = useCallback(async () => {
    if (!blob) return;
    const filename = `denga-${safeFilePart(filenameKey)}.png`;

    try {
      const file = new File([blob], filename, { type: 'image/png' });
      const canShareFile = typeof navigator.share === 'function'
        && (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }));
      if (canShareFile) {
        await navigator.share({ files: [file], title: imageAlt });
        return;
      }
      downloadBlob(blob, filename);
      toast.show(t('stats', 'imageSaved'));
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      toast.show(t('stats', 'imageSaveError'), { variant: 'error' });
    }
  }, [blob, filenameKey, imageAlt, toast, t]);

  return (
    <BottomSheet open={open} title={sheetTitle} onClose={onClose}>
      <div className={styles.previewWrap}>
        <div className={styles.preview}>
          {previewUrl && !error ? (
            <img className={styles.previewImage} src={previewUrl} alt={imageAlt} />
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

export default ResultImageSheet;
