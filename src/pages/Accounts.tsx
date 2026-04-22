import React, { useMemo } from 'react';
import Header from '../components/ui/Header';
import AccountsSnapshot from '../components/ui/AccountsSnapshot';
import { useTransactions } from '../context/TransactionContext';
import { getCustomCategoryName } from '../constants/categories';
import { translations, type CategoryKey } from '../i18n/translations';
import { useTranslation } from '../i18n/LanguageContext';
import styles from './Accounts.module.css';

const formatGroupAmount = (amount: number, currency: string) => {
  const normalized = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(normalized).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const sign = normalized < 0 ? '−' : '';
  const suffix = currency === 'PLN' ? 'zł' : currency;
  return `${sign}${abs} ${suffix}`;
};

const getCurrencyFromNote = (note?: string): string => {
  if (!note) return 'UAH';
  const match = note.match(/Currency:\s*([A-Za-z#0-9_-]+)/i);
  const raw = match?.[1]?.toUpperCase();
  if (!raw) return 'UAH';
  if (raw.startsWith('C#')) return raw.slice(2).toUpperCase();
  return raw;
};

const Accounts: React.FC = () => {
  const { t, locale } = useTranslation();
  const { transactions } = useTransactions();

  const details = useMemo(() => {
    const categoryLabel = (id: string) => {
      const builtIn = translations.ru.categories[id as CategoryKey];
      if (builtIn) return builtIn;
      return getCustomCategoryName(id) ?? id;
    };

    const sourceMap = new Map<string, { id: string; label: string; amount: number; count: number }>();
    transactions
      .filter((tx) => tx.type === 'income')
      .forEach((tx) => {
        const key = tx.categoryId;
        const current = sourceMap.get(key) ?? {
          id: key,
          label: categoryLabel(key),
          amount: 0,
          count: 0,
        };
        current.amount += tx.amount;
        current.count += 1;
        sourceMap.set(key, current);
      });

    const currencyMap = new Map<string, number>();
    transactions.forEach((tx) => {
      const currency = getCurrencyFromNote(tx.note);
      const sign = tx.type === 'income' ? 1 : -1;
      currencyMap.set(currency, (currencyMap.get(currency) ?? 0) + sign * tx.amount);
    });

    return {
      sources: Array.from(sourceMap.values()).sort((a, b) => b.amount - a.amount),
      byCurrency: Array.from(currencyMap.entries())
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    };
  }, [transactions]);

  const sections = useMemo(() => {
    const base = {
      bank: {
        id: 'bank',
        title: 'Карти',
        total: '',
        collapsible: false,
        defaultOpen: true,
        rows: [] as Array<{
          id: string;
          name: string;
          amount: string;
          badge: string;
          subAmount?: string;
          iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';
        }>,
      },
      cash: {
        id: 'cash',
        title: 'Готівка',
        total: '',
        collapsible: true,
        defaultOpen: true,
        rows: [] as Array<{
          id: string;
          name: string;
          amount: string;
          badge: string;
          subAmount?: string;
          iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';
        }>,
      },
      crypto: {
        id: 'crypto',
        title: 'Акції та Крипта',
        total: '',
        collapsible: true,
        defaultOpen: true,
        rows: [] as Array<{
          id: string;
          name: string;
          amount: string;
          badge: string;
          subAmount?: string;
          iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';
        }>,
      },
      debt: {
        id: 'debt',
        title: 'Борг',
        total: '',
        collapsible: true,
        defaultOpen: true,
        rows: [] as Array<{
          id: string;
          name: string;
          amount: string;
          badge: string;
          subAmount?: string;
          iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';
        }>,
      },
    };

    const accountMeta: Record<
      string,
      { section: 'bank' | 'cash' | 'crypto' | 'debt'; label: string; badge: string; debtPhrase?: string }
    > = {
      pumb: { section: 'bank', label: 'pumb', badge: 'P' },
      privat24: { section: 'bank', label: 'Privat24', badge: 'PB' },
      wallet: { section: 'cash', label: 'Wallet', badge: 'W' },
      crypto: { section: 'crypto', label: 'crypto', badge: '₿' },
      sol: { section: 'crypto', label: 'sol', badge: 'S' },
      ton: { section: 'crypto', label: 'Ton', badge: 'T' },
      usdt: { section: 'crypto', label: 'usdt', badge: 'U' },
      misha: { section: 'debt', label: 'Misha', badge: 'M', debtPhrase: 'мені винні' },
    };

    const accountTotals = new Map<string, { fiatAmount: number; fiatCurrency: string; byCurrency: Map<string, number> }>();
    transactions.forEach((tx) => {
      const key = tx.categoryId.trim().toLowerCase();
      const meta = accountMeta[key];
      if (!meta) return;
      const sign = tx.type === 'income' ? 1 : -1;
      const currency = getCurrencyFromNote(tx.note);
      const isFiat = currency === 'UAH' || currency === 'PLN';
      const current = accountTotals.get(key) ?? { fiatAmount: 0, fiatCurrency: 'PLN', byCurrency: new Map() };
      current.byCurrency.set(currency, (current.byCurrency.get(currency) ?? 0) + sign * tx.amount);
      if (isFiat) {
        current.fiatAmount += sign * tx.amount;
        current.fiatCurrency = currency;
      }
      accountTotals.set(key, current);
    });

    const pushAccount = (key: keyof typeof accountMeta) => {
      const meta = accountMeta[key];
      const total = accountTotals.get(key);
      if (!meta || !total) return;
      const amountText = formatGroupAmount(total.fiatAmount, total.fiatCurrency);
      const firstNonFiat = Array.from(total.byCurrency.entries()).find(
        ([currency, amount]) => currency !== 'UAH' && currency !== 'PLN' && amount > 0
      );
      const iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral' =
        key === 'misha' ? 'debt' : meta.section === 'bank' ? 'bank' : meta.section;
      base[meta.section].rows.push({
        id: key,
        name: meta.label,
        amount: meta.debtPhrase ? `${meta.debtPhrase} ${amountText}` : amountText,
        badge: meta.badge,
        iconTone,
        subAmount: firstNonFiat
          ? `${Math.abs(firstNonFiat[1]).toLocaleString('ru-RU', { maximumFractionDigits: 8 })} ${firstNonFiat[0]}`
          : undefined,
      });
    };

    pushAccount('pumb');
    pushAccount('privat24');
    pushAccount('wallet');
    pushAccount('crypto');
    pushAccount('sol');
    pushAccount('ton');
    pushAccount('usdt');
    pushAccount('misha');

    const calculateSectionTotal = (rows: Array<{ id: string }>, defaultCurrency = 'UAH') => {
      if (!rows.length) return `0 ${defaultCurrency === 'PLN' ? 'zł' : defaultCurrency}`;
      const first = accountTotals.get(rows[0].id);
      const currency = first?.fiatCurrency ?? defaultCurrency;
      const sum = rows.reduce((acc, row) => acc + (accountTotals.get(row.id)?.fiatAmount ?? 0), 0);
      return formatGroupAmount(sum, currency);
    };

    base.bank.total = calculateSectionTotal(base.bank.rows, 'UAH');
    base.cash.total = calculateSectionTotal(base.cash.rows, 'PLN');
    base.crypto.total = calculateSectionTotal(base.crypto.rows, 'PLN');
    base.debt.total = calculateSectionTotal(base.debt.rows, 'PLN');

    return [base.bank, base.cash, base.crypto, base.debt];
  }, [transactions]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <Header />
        <AccountsSnapshot sections={sections} />
        <section className={styles.details}>
          <div className={styles.detailCard}>
            <p className={styles.detailTitle}>{t('balance', 'byCurrency')}</p>
            {details.byCurrency.length === 0 ? (
              <p className={styles.emptyRow}>—</p>
            ) : (
              <ul className={styles.list}>
                {details.byCurrency.map((item) => (
                  <li key={item.currency} className={styles.listRow}>
                    <span>{item.currency}</span>
                    <strong>
                      {item.amount < 0 ? '−' : '+'}
                      {Math.abs(item.amount).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.detailCard}>
            <p className={styles.detailTitle}>{t('balance', 'moneySources')}</p>
            {details.sources.length === 0 ? (
              <p className={styles.emptyRow}>—</p>
            ) : (
              <ul className={styles.list}>
                {details.sources.map((source) => (
                  <li key={source.id} className={styles.listRow}>
                    <span>{source.label} ({source.count})</span>
                    <strong>+{source.amount.toLocaleString(locale, { maximumFractionDigits: 2 })}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <div className={styles.spacer} />
      </div>
    </div>
  );
};

export default Accounts;
