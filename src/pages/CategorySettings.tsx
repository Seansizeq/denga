import React, { useEffect, useRef, useState } from 'react';
import { GripVertical, Plus } from 'lucide-react';
import BottomSheet from '../components/ui/BottomSheet';
import {
  CUSTOM_CATEGORY_COLORS,
  CUSTOM_CATEGORY_ICONS,
  type CustomCategoryIcon,
} from '../constants/categories';
import { getCategoryIcon } from '../constants/categoryIcons';
import { useCategoryCatalog, type CatalogCategory } from '../hooks/useCategoryCatalog';
import { useGoBack } from '../hooks/useGoBack';
import { useTranslation } from '../i18n/LanguageContext';
import type { CategoryType } from '../api/client';
import { hapticLight, showAppAlert, showAppConfirm } from '../utils/notify';
import styles from './CategorySettings.module.css';

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; category: CatalogCategory }
  | null;

const CategorySettings: React.FC = () => {
  const { t } = useTranslation();
  const goBack = useGoBack('/settings');
  const [type, setType] = useState<CategoryType>('expense');
  const { categories, loading, reorder, createCategory, saveCategory, removeCategory } =
    useCategoryCatalog(type);

  const [items, setItems] = useState<CatalogCategory[]>(categories);
  const [editor, setEditor] = useState<EditorState>(null);
  const [draftName, setDraftName] = useState('');
  const [draftIcon, setDraftIcon] = useState<CustomCategoryIcon>('Tag');
  const [draftColor, setDraftColor] = useState<string>('#8E8E93');
  const [busy, setBusy] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; index: number; startY: number; rowHeight: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragShift, setDragShift] = useState(0);

  // The list is the catalog until a drag starts moving rows around; committing
  // the new order re-renders it from the catalog again.
  useEffect(() => {
    if (dragRef.current) return;
    setItems(categories);
  }, [categories]);

  const openCreate = () => {
    setDraftName('');
    setDraftIcon('Tag');
    setDraftColor('#8E8E93');
    setEditor({ mode: 'create' });
  };

  const openEdit = (category: CatalogCategory) => {
    setDraftName(category.name);
    setDraftIcon(
      (CUSTOM_CATEGORY_ICONS as readonly string[]).includes(category.icon)
        ? (category.icon as CustomCategoryIcon)
        : 'Tag',
    );
    setDraftColor(category.color || '#8E8E93');
    setEditor({ mode: 'edit', category });
  };

  const closeEditor = () => {
    if (busy) return;
    setEditor(null);
  };

  const handleSave = async () => {
    if (!editor || busy) return;
    const name = draftName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    setBusy(true);
    try {
      if (editor.mode === 'create') {
        await createCategory({ name, icon: draftIcon, color: draftColor });
      } else {
        await saveCategory(editor.category.id, { name, icon: draftIcon, color: draftColor });
      }
      hapticLight();
      setEditor(null);
    } catch {
      showAppAlert(t('settings', 'saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!editor || editor.mode !== 'edit' || busy) return;
    if (!(await showAppConfirm(t('categoriesManager', 'deleteConfirm')))) return;
    setBusy(true);
    try {
      await removeCategory(editor.category.id);
      hapticLight();
      setEditor(null);
    } catch {
      showAppAlert(t('settings', 'saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onHandleDown = (event: React.PointerEvent<HTMLSpanElement>, index: number) => {
    const list = listRef.current;
    if (!list) return;
    const rows = list.querySelectorAll(`.${styles.row}`);
    const first = rows[0]?.getBoundingClientRect();
    const second = rows[1]?.getBoundingClientRect();
    // Rows are uniform, so the gap between the first two is the drag step.
    const rowHeight = first && second ? second.top - first.top : first?.height ?? 58;
    dragRef.current = { id: items[index].id, index, startY: event.clientY, rowHeight };
    setDragId(items[index].id);
    setDragShift(0);
    try {
      // Keeps the move/up events coming to this handle even when the finger
      // slides off it; not every engine allows it, and losing it is survivable.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    hapticLight();
  };

  const onHandleMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientY - drag.startY;
    const step = Math.round(delta / drag.rowHeight);
    const target = Math.min(Math.max(drag.index + step, 0), items.length - 1);
    if (target !== drag.index) {
      // `from` is read now, not inside the updater: React runs the updater
      // during render, by which time drag.index has already moved on.
      const from = drag.index;
      setItems((prev) => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(target, 0, moved);
        return next;
      });
      // Anchor to the row's new home so the next step measures from there.
      drag.startY += (target - from) * drag.rowHeight;
      drag.index = target;
      setDragShift(event.clientY - drag.startY);
      hapticLight();
      return;
    }
    setDragShift(delta);
  };

  const onHandleUp = async () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragId(null);
    setDragShift(0);
    const ids = items.map((c) => c.id);
    try {
      await reorder(ids);
    } catch {
      showAppAlert(t('settings', 'saveFailed'));
    }
  };

  const canSave = draftName.trim().length > 0 && !busy;
  const isCustomEdit = editor?.mode === 'edit' && editor.category.isCustom;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={goBack}>
          ← {t('settings', 'title')}
        </button>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{t('categoriesManager', 'title')}</h1>
          <button
            type="button"
            className={styles.addBtn}
            onClick={openCreate}
            aria-label={t('categoriesManager', 'add')}
          >
            <Plus size={22} strokeWidth={2.4} />
          </button>
        </div>
        <p className={styles.subtitle}>{t('categoriesManager', 'subtitle')}</p>
      </header>

      <div className={styles.tabs} role="tablist">
        {(['expense', 'income'] as CategoryType[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={type === tab}
            className={`${styles.tab} ${type === tab ? styles.tabActive : ''}`}
            onClick={() => setType(tab)}
          >
            {t('categoriesManager', tab === 'expense' ? 'tabExpense' : 'tabIncome')}
          </button>
        ))}
      </div>

      <div className={styles.card} ref={listRef}>
        {loading ? (
          [0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.row}>
              <span className={`${styles.skeletonIcon} motion-skeleton`} />
              <span className={`${styles.skeletonName} motion-skeleton`} />
            </div>
          ))
        ) : (
          items.map((category) => {
            const Icon = getCategoryIcon(category.icon, 'Circle');
            const dragging = dragId === category.id;
            return (
              <div
                key={category.id}
                className={`${styles.row} ${dragging ? styles.rowDragging : ''}`}
                style={dragging ? { transform: `translateY(${dragShift}px)` } : undefined}
              >
                <button type="button" className={styles.rowMain} onClick={() => openEdit(category)}>
                  <span className={styles.rowIcon} style={{ background: category.color }}>
                    <Icon size={18} color="#fff" strokeWidth={2} />
                  </span>
                  <span className={styles.name}>{category.name}</span>
                </button>
                <span
                  className={styles.handle}
                  role="button"
                  tabIndex={-1}
                  aria-label={t('categoriesManager', 'reorder')}
                  onPointerDown={(e) => onHandleDown(e, items.indexOf(category))}
                  onPointerMove={onHandleMove}
                  onPointerUp={() => void onHandleUp()}
                  onPointerCancel={() => void onHandleUp()}
                >
                  <GripVertical size={20} strokeWidth={2} />
                </span>
              </div>
            );
          })
        )}
      </div>

      <p className={styles.hint}>{t('categoriesManager', 'hint')}</p>

      <BottomSheet
        open={editor !== null}
        title={
          editor?.mode === 'create'
            ? t('categoriesManager', 'add')
            : t('categoriesManager', 'editTitle')
        }
        onClose={closeEditor}
        closeLabel={t('addTx', 'cancel')}
      >
        <div className={styles.editor}>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={t('addTx', 'customCategoryPlaceholder')}
            className={styles.input}
            maxLength={40}
          />

          <p className={styles.pickerLabel}>{t('addTx', 'chooseIcon')}</p>
          <div className={styles.iconGrid}>
            {CUSTOM_CATEGORY_ICONS.map((iconName) => {
              const Icon = getCategoryIcon(iconName, 'Tag');
              return (
                <button
                  key={iconName}
                  type="button"
                  className={`${styles.iconBtn} ${draftIcon === iconName ? styles.iconBtnSelected : ''}`}
                  onClick={() => setDraftIcon(iconName)}
                >
                  <Icon size={20} strokeWidth={1.8} />
                </button>
              );
            })}
          </div>

          <p className={styles.pickerLabel}>{t('addTx', 'chooseColor')}</p>
          <div className={styles.colorGrid}>
            {CUSTOM_CATEGORY_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`${styles.colorBtn} ${draftColor === color ? styles.colorBtnSelected : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setDraftColor(color)}
                aria-label={color}
              />
            ))}
          </div>

          <div className={styles.actions}>
            {isCustomEdit ? (
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={() => void handleDelete()}
                disabled={busy}
              >
                {t('history', 'delete')}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.saveBtn}
              onClick={() => void handleSave()}
              disabled={!canSave}
            >
              {editor?.mode === 'create' ? t('addTx', 'create') : t('addTx', 'saveChanges')}
            </button>
          </div>

          {editor?.mode === 'edit' && !editor.category.isCustom ? (
            <p className={styles.editorHint}>{t('categoriesManager', 'builtInHint')}</p>
          ) : null}
        </div>
      </BottomSheet>
    </div>
  );
};

export default CategorySettings;
