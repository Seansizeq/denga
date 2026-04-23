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
  onRowPress?: (id: string) => void;
}

const iconToneClass = (tone: RowIconTone) => {
  if (tone === 'cash') return styles.iconCash;
  if (tone === 'crypto') return styles.iconCrypto;
  if (tone === 'debt') return styles.iconDebt;
  if (tone === 'bank') return styles.iconBank;
  return styles.iconNeutral;
};

const AccountsSnapshot: React.FC<AccountsSnapshotProps> = ({ sections, onRowPress }) => {
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
        const hasBody = group.rows.length > 0;
        const showBody = isCollapsible ? isOpen && hasBody : hasBody;

        if (!needsHeader && !hasBody) return null;

        return (
          <div key={group.id} className={styles.group}>
            {needsHeader ? (
              <div 
                className={styles.header}
                onClick={isCollapsible ? () => setOpen(prev => ({ ...prev, [group.id]: !isOpen })) : undefined}
                style={{ cursor: isCollapsible ? 'pointer' : 'default' }}
                role={isCollapsible ? 'button' : undefined}
                aria-expanded={isCollapsible ? isOpen : undefined}
              >
                <div className={styles.headerLeft}>
                  {group.title?.trim() ? <h3 className={styles.title}>{group.title}</h3> : null}
                </div>
                <div className={styles.headerRight}>
                  {group.total?.trim() ? <span className={styles.total}>{group.total}</span> : null}
                  {isCollapsible ? (
                    <ChevronDown size={18} strokeWidth={2.4} className={`${styles.chevron} ${isOpen ? '' : styles.chevronClosed}`} />
                  ) : null}
                </div>
              </div>
            ) : null}

            {showBody ? (
              <div className={styles.list}>
                {group.rows.map((row) => {
                  const tone: RowIconTone = row.iconTone ?? 'bank';
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className={styles.row}
                      onClick={() => onRowPress?.(row.id)}
                      disabled={!onRowPress}
                    >
                      <div className={styles.iconCircle}>
                        <span className={`${styles.icon} ${iconToneClass(tone)}`}>
                          {row.badge ?? row.name.slice(0, 1)}
                        </span>
                      </div>

                      <div className={styles.info}>
                        <span className={styles.name}>{row.name}</span>
                        {row.subAmount ? <span className={styles.subtitle}>{row.subAmount}</span> : null}
                      </div>

                      <div className={styles.right}>
                        <span className={styles.amount}>{row.amount}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
};

export default AccountsSnapshot;
