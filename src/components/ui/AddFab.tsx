import React from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import styles from './AddFab.module.css';

const AddFab: React.FC = () => {
  const { t } = useTranslation();
  return (
    <Link
      to="/add"
      className={styles.fab}
      aria-label={t('dashboard', 'addTransaction')}
    >
      <Plus size={26} strokeWidth={2.4} />
    </Link>
  );
};

export default AddFab;
