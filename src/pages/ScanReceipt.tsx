import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { Camera, ScanLine, X } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { findCategory, getCustomCategoryData } from '../constants/categories';
import type { CategoryKey } from '../i18n/translations';
import { compressImage } from '../utils/imageCompress';
import { scanReceipt, type ScanReceiptError, type ScannedReceipt } from '../api/receipts';
import { formatCurrency } from '../utils/formatters';
import styles from './ScanReceipt.module.css';

const iconRegistry = LucideIcons as unknown as Record<
  string,
  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
>;

type ViewState = 'idle' | 'loading' | 'result' | 'error';

const ScanReceipt: React.FC = () => {
  const navigate = useNavigate();
  const { t, locale } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [view, setView] = useState<ViewState>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ScannedReceipt | null>(null);
  const [error, setError] = useState<ScanReceiptError | null>(null);

  const triggerCamera = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const handleFile = async (file: File) => {
    setView('loading');
    setReceipt(null);
    setError(null);
    try {
      const compressed = await compressImage(file);
      setPreviewUrl(compressed.dataUrl);
      const res = await scanReceipt(compressed.base64);
      if (!res.ok) {
        setError(res.error);
        setView('error');
        return;
      }
      setReceipt(res.receipt);
      setView('result');
    } catch (err) {
      console.error('[scan] failed to process image', err);
      setError({ kind: 'unknown' });
      setView('error');
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void handleFile(file);
  };

  const goToAddTransaction = () => {
    if (!receipt) return;
    const params = new URLSearchParams();
    params.set('type', 'expense');
    if (receipt.total != null && receipt.total > 0) {
      params.set('amount', String(receipt.total));
    }
    if (receipt.currency) params.set('currency', receipt.currency);
    if (receipt.categoryId) params.set('categoryId', receipt.categoryId);
    const noteParts: string[] = [];
    if (receipt.shop) noteParts.push(receipt.shop);
    if (receipt.items.length > 0) {
      const itemsBrief = receipt.items
        .slice(0, 3)
        .map((i) => i.name)
        .join(', ');
      if (itemsBrief) noteParts.push(itemsBrief);
    }
    const note = noteParts.join(' • ').slice(0, 120);
    if (note) params.set('note', note);
    navigate(`/add?${params.toString()}`);
  };

  const renderCategoryChip = (categoryId: string) => {
    const customData = getCustomCategoryData(categoryId);
    if (customData) {
      const IconComponent = iconRegistry[customData.icon] ?? LucideIcons.Tag;
      return (
        <span className={styles.categoryChip}>
          <IconComponent size={16} color={customData.color} strokeWidth={2} />
          {customData.name}
        </span>
      );
    }
    const def = findCategory(categoryId);
    const IconComponent = iconRegistry[def.icon] ?? LucideIcons.Circle;
    const name = t('categories', def.id as CategoryKey);
    return (
      <span className={styles.categoryChip}>
        <IconComponent size={16} color={def.color} strokeWidth={2} />
        {name}
      </span>
    );
  };

  const errorMessage = (err: ScanReceiptError): string => {
    switch (err.kind) {
      case 'not_configured':
        return t('scan', 'errorNotConfigured');
      case 'rate_limited':
        return t('scan', 'errorRateLimited');
      case 'too_large':
        return t('scan', 'errorTooLarge');
      case 'invalid':
        return t('scan', 'errorInvalid');
      case 'provider':
        return t('scan', 'errorProvider');
      case 'network':
        return t('scan', 'errorNetwork');
      default:
        return t('scan', 'errorUnknown');
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className={styles.closeBtn}
          aria-label={t('scan', 'close')}
        >
          <X size={20} strokeWidth={2.5} />
        </button>
        <h2 className={styles.title}>{t('scan', 'title')}</h2>
        <span className={styles.headerSpacer} aria-hidden="true" />
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        className={styles.hiddenInput}
      />

      {view === 'idle' ? (
        <section className={styles.idle}>
          <div className={styles.illustration}>
            <ScanLine size={64} strokeWidth={1.5} />
          </div>
          <p className={styles.idleText}>{t('scan', 'idleHint')}</p>
          <button type="button" className={styles.shotBtn} onClick={triggerCamera}>
            <Camera size={20} strokeWidth={2} />
            {t('scan', 'takePhoto')}
          </button>
        </section>
      ) : null}

      {view === 'loading' ? (
        <section className={styles.loading}>
          {previewUrl ? (
            <img src={previewUrl} alt="" className={styles.previewImg} />
          ) : null}
          <div className={styles.spinner} aria-hidden="true" />
          <p className={styles.loadingText}>{t('scan', 'processing')}</p>
        </section>
      ) : null}

      {view === 'error' && error ? (
        <section>
          <div className={styles.errorCard} role="alert">
            <div>{errorMessage(error)}</div>
            {error.status || error.details ? (
              <pre
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: 'rgba(255,180,180,0.85)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {error.status ? `HTTP ${error.status}` : null}
                {error.status && error.details ? '\n' : ''}
                {error.details ?? ''}
              </pre>
            ) : null}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primaryBtn} onClick={triggerCamera}>
              {t('scan', 'retake')}
            </button>
          </div>
        </section>
      ) : null}

      {view === 'result' && receipt ? (
        <section className={styles.result}>
          <div className={styles.thumbRow}>
            {previewUrl ? <img src={previewUrl} alt="" className={styles.thumb} /> : null}
            <div className={styles.shopBlock}>
              <h3 className={styles.shopName}>
                {receipt.shop ?? t('scan', 'unknownShop')}
              </h3>
              <p className={styles.shopMeta}>
                {receipt.date ?? t('scan', 'noDate')}
              </p>
            </div>
          </div>

          <div className={styles.totalCard}>
            <div>
              <p className={styles.totalLabel}>{t('scan', 'totalLabel')}</p>
              <p className={styles.totalValue}>
                {receipt.total != null
                  ? formatCurrency(receipt.total, locale, receipt.currency)
                  : t('scan', 'noTotalFound')}
              </p>
            </div>
            <span className={styles.currencyChip}>{receipt.currency}</span>
          </div>

          {renderCategoryChip(receipt.categoryId)}

          {receipt.items.length > 0 ? (
            <div className={styles.itemsCard}>
              <p className={styles.itemsTitle}>{t('scan', 'itemsTitle')}</p>
              {receipt.items.slice(0, 5).map((item, idx) => (
                <div key={`${item.name}-${idx}`} className={styles.itemRow}>
                  <span className={styles.itemName}>{item.name}</span>
                  <span className={styles.itemAmount}>
                    {formatCurrency(item.amount, locale, receipt.currency)}
                  </span>
                </div>
              ))}
              {receipt.items.length > 5 ? (
                <p className={styles.itemsMore}>
                  {t('scan', 'itemsMore').replace('{n}', String(receipt.items.length - 5))}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={goToAddTransaction}
              disabled={receipt.total == null || receipt.total <= 0}
            >
              {t('scan', 'confirmAndEdit')}
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={triggerCamera}>
              {t('scan', 'retake')}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default ScanReceipt;
