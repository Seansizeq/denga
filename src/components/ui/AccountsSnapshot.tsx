import React from 'react';
import styles from './AccountsSnapshot.module.css';

type AccountRow = {
  id: string;
  name: string;
  amount: string;
  subAmount?: string;
  badge?: string;
};

type AccountSection = {
  id: string;
  title: string;
  total: string;
  rows: readonly AccountRow[];
};

interface AccountsSnapshotProps {
  sections: readonly AccountSection[];
}

const AccountsSnapshot: React.FC<AccountsSnapshotProps> = ({ sections }) => {
  return (
    <section className={styles.section}>
      {sections.map((group) => (
        <article key={group.id} className={styles.card}>
          <header className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>{group.title}</h3>
            <span className={styles.cardTotal}>{group.total}</span>
          </header>

          <div className={styles.rows}>
            {group.rows.map((row) => (
              <div key={row.id} className={styles.row}>
                <div className={styles.left}>
                  <span className={styles.icon}>{row.badge ?? row.name.slice(0, 1)}</span>
                  <span className={styles.name}>{row.name}</span>
                </div>
                <div className={styles.right}>
                  <span className={styles.amount}>{row.amount}</span>
                  {row.subAmount ? <span className={styles.subAmount}>{row.subAmount}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
};

export default AccountsSnapshot;
