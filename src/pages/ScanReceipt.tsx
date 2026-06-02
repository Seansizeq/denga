import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { Camera, ScanLine, X } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { useTransactions } from '../context/TransactionContext';
import { usePortfolio } from '../context/PortfolioContext';
import { CATEGORIES, findCategory, getCustomCategoryData, inferCustomCategoryIcon } from '../constants/categories';
import type { CategoryKey } from '../i18n/translations';
import { compressImage } from '../utils/imageCompress';
import { scanReceipt, type ScanReceiptError, type ScannedReceipt } from '../api/receipts';
import { formatCurrency } from '../utils/formatters';
import { mergeAccountIntoNoteLimited } from '../utils/transactionAccount';
import { usePaymentAccountOptions } from '../hooks/usePaymentAccountOptions';
import styles from './ScanReceipt.module.css';

const iconRegistry = LucideIcons as unknown as Record<
  string,
  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
>;

type ViewState = 'idle' | 'loading' | 'result' | 'review' | 'error';

const ScanReceipt: React.FC = () => {
  const navigate = useNavigate();
  const { t, locale, language } = useTranslation();
  const { addTransaction } = useTransactions();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [view, setView] = useState<ViewState>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ScannedReceipt | null>(null);
  const [error, setError] = useState<ScanReceiptError | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('other_expense');
  const { accounts: rawAccounts } = usePortfolio();
  const portfolioAccounts = useMemo<Array<{ key: string; name: string }>>(
    () => {
      const list: Array<{ key: string; name: string }> = [];
      for (const row of rawAccounts) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const key = String(r.accountKey ?? '').trim().toLowerCase();
        if (!key) continue;
        const name = String(r.name ?? r.accountKey ?? '').trim().slice(0, 40);
        list.push({ key, name: name || key });
      }
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      return list;
    },
    [rawAccounts],
  );
  const [paymentAccount, setPaymentAccount] = useState('');
  const [draftShop, setDraftShop] = useState('');
  const [draftTotal, setDraftTotal] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftNote, setDraftNote] = useState('');

  const { allowedPaymentKeys, paymentChipOptions } = usePaymentAccountOptions(portfolioAccounts, language);

  const triggerCamera = () => {
    setError(null);
    setSaveErrorMessage('');
    fileInputRef.current?.click();
  };

  const compressForUpload = async (file: File) => {
    const attempts = [
      undefined,
      { maxSize: 1400, quality: 0.78 as const },
      { maxSize: 1200, quality: 0.68 as const },
      { maxSize: 1000, quality: 0.6 as const },
    ];
    let best = await compressImage(file, attempts[0]);
    for (let i = 1; i < attempts.length && best.bytes > 980 * 1024; i += 1) {
      best = await compressImage(file, attempts[i]);
    }
    return best;
  };

  const handleFile = async (file: File) => {
    setView('loading');
    setReceipt(null);
    setError(null);
    setSaveErrorMessage('');
    try {
      const compressed = await compressForUpload(file);
      setPreviewUrl(compressed.dataUrl);
      const res = await scanReceipt(compressed.base64);
      if (!res.ok) {
        setError(res.error);
        setView('error');
        return;
      }
      setReceipt(res.receipt);
      const autoCategory = CATEGORIES.some((c) => c.type === 'expense' && c.id === res.receipt.categoryId)
        ? res.receipt.categoryId
        : 'other_expense';
      setSelectedCategoryId(autoCategory);
      setView(res.receipt.scanStatus === 'review_required' ? 'review' : 'result');
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

  const buildScannedNote = (r: ScannedReceipt): string => {
    const noteParts: string[] = [];
    if (draftShop.trim()) noteParts.push(draftShop.trim());
    else if (r.shop) noteParts.push(r.shop);
    if (r.items.length > 0) {
      const itemsBrief = r.items
        .slice(0, 3)
        .map((i) => i.name)
        .join(', ');
      if (itemsBrief) noteParts.push(itemsBrief);
    }
    const autoNote = noteParts.join(' • ').slice(0, 120);
    return draftNote.trim() || autoNote;
  };

  const reviewReasons = (r: ScannedReceipt): string[] => {
    const reasons: string[] = [];
    const flags = new Set(r.reviewFlags);
    if (r.code === 'NO_TEXT_DETECTED' || flags.has('no_text_detected')) {
      reasons.push(t('scan', 'reviewReasonNoText'));
    }
    if (flags.has('missing_total')) {
      reasons.push(t('scan', 'reviewReasonMissingTotal'));
    }
    if (flags.has('missing_shop')) {
      reasons.push(t('scan', 'reviewReasonMissingShop'));
    }
    if (flags.has('unknown_currency') || flags.has('unsupported_currency') || flags.has('inferred_currency')) {
      reasons.push(t('scan', 'reviewReasonCurrency'));
    }
    if (flags.has('payment_total_override') || flags.has('payment_total_fallback')) {
      reasons.push(t('scan', 'reviewReasonPayment'));
    }
    if (reasons.length === 0 && r.reviewRequired) {
      reasons.push(t('scan', 'reviewReasonManualCheck'));
    }
    return reasons;
  };

  useEffect(() => {
    if (!receipt) {
      setDraftShop('');
      setDraftTotal('');
      setDraftDate('');
      setDraftNote('');
      return;
    }
    setDraftShop(receipt.shop ?? '');
    setDraftTotal(receipt.total != null && receipt.total > 0 ? String(receipt.total) : '');
    setDraftDate(receipt.date ?? '');
    setDraftNote('');
  }, [receipt]);

  const parsedDraftTotal = useMemo(() => {
    const value = Number.parseFloat(draftTotal.replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [draftTotal]);

  const saveScannedTransaction = async () => {
    if (!receipt || parsedDraftTotal == null || saving) return;
    if (!paymentAccount) return;
    setSaving(true);
    setSaveErrorMessage('');
    const note = mergeAccountIntoNoteLimited(buildScannedNote(receipt), paymentAccount, allowedPaymentKeys);
    const ok = await addTransaction({
      amount: parsedDraftTotal,
      currency: receipt.currency,
      type: 'expense',
      categoryId: selectedCategoryId,
      date: draftDate || undefined,
      note: note || undefined,
    });
    setSaving(false);
    if (!ok) {
      setSaveErrorMessage(t('addTx', 'saveFailed'));
      return;
    }
    navigate('/');
  };

  const openEditWithPrefill = () => {
    if (!receipt) return;
    const params = new URLSearchParams();
    params.set('type', 'expense');
    if (parsedDraftTotal != null) params.set('amount', String(parsedDraftTotal));
    if (receipt.currency) params.set('currency', receipt.currency);
    if (draftDate) params.set('date', draftDate);
    if (selectedCategoryId) params.set('categoryId', selectedCategoryId);
    else if (receipt.categoryId) params.set('categoryId', receipt.categoryId);
    const note = mergeAccountIntoNoteLimited(buildScannedNote(receipt), paymentAccount, allowedPaymentKeys);
    if (note) params.set('note', note);
    if (paymentAccount) params.set('account', paymentAccount);
    navigate(`/add?${params.toString()}`);
  };

  const renderCategoryChip = (categoryId: string) => {
    const customData = getCustomCategoryData(categoryId);
    if (customData) {
      const customIcon = inferCustomCategoryIcon(customData.name, customData.icon);
      const IconComponent = iconRegistry[customIcon] ?? LucideIcons.Tag;
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
      case 'auth':
        return t('scan', 'errorAuth');
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

  const errorExtra = (err: ScanReceiptError): string => {
    if (err.kind === 'rate_limited') {
      const seconds = Math.max(1, Math.ceil(err.retryAfterMs / 1000));
      return t('scan', 'errorRateLimitedRetry').replace('{n}', String(seconds));
    }
    return '';
  };

  const canDirectSave = Boolean(
    receipt &&
      paymentAccount &&
      parsedDraftTotal != null
  );

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
            {errorExtra(error) ? <div className={styles.errorExtra}>{errorExtra(error)}</div> : null}
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

      {(view === 'result' || view === 'review') && receipt ? (
        <section className={styles.result}>
          <div className={styles.thumbRow}>
            {previewUrl ? <img src={previewUrl} alt="" className={styles.thumb} /> : null}
            <div className={styles.shopBlock}>
              <input
                type="text"
                value={draftShop}
                onChange={(e) => setDraftShop(e.target.value)}
                className={styles.shopInput}
                placeholder={t('scan', 'unknownShop')}
              />
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className={styles.shopDateInput}
              />
            </div>
          </div>

          <div className={styles.totalCard}>
            <div>
              <p className={styles.totalLabel}>{t('scan', 'totalLabel')}</p>
              <input
                type="text"
                inputMode="decimal"
                value={draftTotal}
                onChange={(e) => setDraftTotal(e.target.value.replace(/[^0-9.,]/g, ''))}
                className={styles.totalInput}
                placeholder={t('scan', 'noTotalFound')}
              />
            </div>
            <span className={styles.currencyChip}>{receipt.currency}</span>
          </div>

          {view === 'review' ? (
            <div className={styles.reviewCard} role="status">
              <p className={styles.reviewTitle}>{t('scan', 'reviewTitle')}</p>
              <p className={styles.reviewText}>{t('scan', 'reviewHint')}</p>
              <ul className={styles.reviewList}>
                {reviewReasons(receipt).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <section className={styles.paymentSection} aria-label={t('addTx', 'category')}>
            <h3 className={styles.sectionTitle}>{t('addTx', 'category')}</h3>
            <p className={styles.paymentHint}>{renderCategoryChip(selectedCategoryId)}</p>
          </section>

          <section className={styles.paymentSection} aria-label={t('addTx', 'paymentAccount')}>
            <h3 className={styles.sectionTitle}>{t('addTx', 'paymentAccount')}</h3>
            <p className={styles.paymentHint}>{t('addTx', 'paymentAccountHint')}</p>
            <div className={styles.paymentChips}>
              {paymentChipOptions.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.paymentChip} ${paymentAccount === key ? styles.paymentChipActive : ''}`}
                  onClick={() => setPaymentAccount(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.paymentSection} aria-label={t('addTx', 'note')}>
            <h3 className={styles.sectionTitle}>{t('addTx', 'note')}</h3>
            <input
              type="text"
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              className={styles.noteInput}
              placeholder={t('addTx', 'notePlaceholder')}
              maxLength={120}
            />
          </section>

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

          {view === 'review' && receipt.rawText ? (
            <div className={styles.rawTextCard}>
              <p className={styles.itemsTitle}>{t('scan', 'ocrTextTitle')}</p>
              <pre className={styles.rawTextContent}>{receipt.rawText.slice(0, 1000)}</pre>
            </div>
          ) : null}

          {saveErrorMessage ? (
            <div className={styles.errorCard} role="alert">
              {saveErrorMessage}
            </div>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void saveScannedTransaction()}
              disabled={!canDirectSave || saving}
            >
              {saving ? t('addTx', 'save') : t('scan', 'saveConfirmed')}
            </button>
            {!paymentAccount || parsedDraftTotal == null ? (
              <p className={styles.requiredHint} role="alert">
                {!paymentAccount ? t('scan', 'selectPaymentAccount') : t('scan', 'noTotalFound')}
              </p>
            ) : null}
            <button type="button" className={styles.secondaryBtn} onClick={openEditWithPrefill}>
              {view === 'review' ? t('scan', 'reviewAndEdit') : t('history', 'edit')}
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
