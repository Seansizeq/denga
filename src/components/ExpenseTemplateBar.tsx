import React, { useState } from 'react';
import { BookmarkPlus, Pencil, Check, X } from 'lucide-react';
import type { ExpenseTemplate } from '../hooks/useExpenseTemplates';
import type { TransactionType } from '../types';
import styles from './ExpenseTemplateBar.module.css';

interface Props {
  templates: ExpenseTemplate[];
  currentType: TransactionType;
  canSave: boolean;
  onApply: (template: ExpenseTemplate) => void;
  onDelete: (id: string) => void;
  onSave: (name: string) => void;
  labels: {
    title: string;
    saveAsTemplate: string;
    namePlaceholder: string;
    editTemplates: string;
    cancelTemplate: string;
    saveTemplate: string;
    deleteTemplate: (name: string) => string;
  };
}

const ExpenseTemplateBar: React.FC<Props> = ({
  templates,
  currentType,
  canSave,
  onApply,
  onDelete,
  onSave,
  labels,
}) => {
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  const filtered = templates.filter((t) => t.type === currentType);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName('');
    setSaving(false);
  };

  if (filtered.length === 0 && !canSave) return null;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>{labels.title}</h3>
        <div className={styles.actions}>
          {canSave && !saving && (
            <button
              type="button"
              id="btn-save-as-template"
              className={styles.actionBtn}
              onClick={() => {
                setSaving(true);
                setEditMode(false);
              }}
              aria-label={labels.saveAsTemplate}
              title={labels.saveAsTemplate}
            >
              <BookmarkPlus size={15} strokeWidth={2} />
            </button>
          )}
          {filtered.length > 0 && !saving && (
            <button
              type="button"
              id="btn-template-edit-mode"
              className={`${styles.actionBtn} ${editMode ? styles.actionBtnActive : ''}`}
              onClick={() => setEditMode((e) => !e)}
              aria-label={labels.editTemplates}
            >
              {editMode ? (
                <Check size={15} strokeWidth={2.5} />
              ) : (
                <Pencil size={15} strokeWidth={2} />
              )}
            </button>
          )}
        </div>
      </div>

      {saving && (
        <div className={styles.saveRow}>
          <input
            id="template-name-input"
            type="text"
            className={styles.nameInput}
            placeholder={labels.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setSaving(false);
            }}
            autoFocus
            maxLength={40}
          />
          <button
            type="button"
            className={styles.saveCancelBtn}
            onClick={() => setSaving(false)}
            aria-label={labels.cancelTemplate}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            className={styles.saveConfirmBtn}
            disabled={!name.trim()}
            onClick={handleSave}
            aria-label={labels.saveTemplate}
          >
            <Check size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className={styles.scroll} role="list" aria-label={labels.title}>
          {filtered.map((tpl) => (
            <div key={tpl.id} className={styles.chipWrap} role="listitem">
              <button
                type="button"
                className={styles.chip}
                onClick={() => {
                  if (!editMode) onApply(tpl);
                }}
                disabled={editMode}
                aria-label={tpl.name}
              >
                <span className={styles.chipName}>{tpl.name}</span>
                {tpl.amount != null && tpl.amount > 0 && (
                  <span className={styles.chipAmount}>
                    {tpl.amount.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} {tpl.currency}
                  </span>
                )}
              </button>
              {editMode && (
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => onDelete(tpl.id)}
                  aria-label={labels.deleteTemplate(tpl.name)}
                >
                  <X size={10} strokeWidth={3} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default ExpenseTemplateBar;
