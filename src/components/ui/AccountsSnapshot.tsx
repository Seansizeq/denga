import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './AccountsSnapshot.module.css';

type RowIconTone = 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';

type AccountRow = {
  id: string;
  name: string;
  amount: string;
  subAmount?: string;
  badge?: string;
  iconTone?: RowIconTone;
};

type AccountSection = {
  id: string;
  title: string;
  total: string;
  rows: readonly AccountRow[];
  collapsible?: boolean;
  defaultOpen?: boolean;
  variant?: 'default' | 'strip';
};

interface AccountsSnapshotProps {
  sections: readonly AccountSection[];
}

const iconToneClass = (tone: RowIconTone) => {
  if (tone === 'cash') return styles.iconCash;
  if (tone === 'crypto') return styles.iconCrypto;
  if (tone === 'debt') return styles.iconDebt;
  if (tone === 'bank') return styles.iconBank;
  return styles.iconNeutral;
};

const AccountsSnapshot: React.FC<AccountsSnapshotProps> = ({ sections }) => {
  const initialOpen = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const s of sections) {
      if (!s.collapsible) {
        map[s.id] = true;
        continue;
      }
      map[s.id] = s.defaultOpen ?? false;
    }
    return map;
  }, [sections]);

  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen);

  useEffect(() => {
    setOpen(initialOpen);
  }, [initialOpen]);

  return (
    <section className={styles.section}>
      {sections.map((group) => {
        const isCollapsible = Boolean(group.collapsible);
        const isOpen = open[group.id] ?? false;
        const needsHeader = Boolean(group.title?.trim() || group.total?.trim() || isCollapsible);
        const isStrip = (group.variant ?? 'default') === 'strip' || isCollapsible;
        const hasBody = group.rows.length > 0;
        const showBody = isCollapsible ? isOpen && hasBody : hasBody;

        return (
          <article
            key={group.id}
            className={`${styles.card} ${isStrip ? styles.cardStrip : ''} ${!needsHeader && !showBody ? styles.cardEmpty : ''}`}
          >
            {needsHeader ? (
              isCollapsible ? (
                <button
                  type="button"
                  className={styles.stripButton}
                  onClick={() => setOpen((prev) => ({ ...prev, [group.id]: !isOpen }))}
                  aria-expanded={isOpen}
                >
                  <div className={styles.stripLeft}>
                    {group.title?.trim() ? <h3 className={styles.stripTitle}>{group.title}</h3> : <span className={styles.headerSpacer} />}
                  </div>
                  <div className={styles.stripRight}>
                    {group.total?.trim() ? <span className={styles.stripTotal}>{group.total}</span> : null}
                    <span className={`${styles.chevron} ${isOpen ? '' : styles.chevronClosed}`} aria-hidden="true">
                      <ChevronDown size={16} strokeWidth={2.4} />
                    </span>
                  </div>
                </button>
              ) : (
                <div className={styles.headerStatic}>
                  <div className={styles.headerLeft}>
                    {group.title?.trim() ? <h3 className={styles.cardTitle}>{group.title}</h3> : <span className={styles.headerSpacer} />}
                  </div>
                  <div className={styles.headerRight}>
                    {group.total?.trim() ? <span className={styles.cardTotal}>{group.total}</span> : null}
                  </div>
                </div>
              )
            ) : null}

            {showBody ? (
              <div className={styles.rows}>
                {group.rows.map((row) => {
                  const tone: RowIconTone = row.iconTone ?? 'bank';
                  return (
                    <div key={row.id} className={styles.row}>
                      <div className={styles.left}>
                        <span className={`${styles.icon} ${iconToneClass(tone)}`}>
                          {row.badge ?? row.name.slice(0, 1)}
                        </span>
                        <span className={styles.name}>{row.name}</span>
                      </div>
                      <div className={styles.right}>
                        <span className={styles.amount}>{row.amount}</span>
                        {row.subAmount ? <span className={styles.subAmount}>{row.subAmount}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
};

export default AccountsSnapshot;
