import React, { useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import FormSheet from '../ui/FormSheet';
import formStyles from '../ui/FormSheet.module.css';
import { useTranslation } from '../../i18n/LanguageContext';
import { useToast } from '../ui/Toast';
import { compressImage, type CompressedImage } from '../../utils/imageCompress';
import { FEEDBACK_MAX_LENGTH, sendFeedback, type FeedbackResult } from '../../api/client';
import styles from './FeedbackSheet.module.css';

interface FeedbackSheetProps {
  onClose: () => void;
  /** Маршрут, з якого пишуть; їде в лист разом з текстом. */
  screen?: string;
  /** Текст помилки — коли лист пишуть просто з екрана падіння. */
  error?: string;
}

/** Лічильник вмикається тільки на підході до стелі. */
const COUNTER_FROM = FEEDBACK_MAX_LENGTH - 200;

/**
 * До чого стискаємо знімок. Тіло запиту обмежене мегабайтом, а base64 більший
 * за самі байти на третину — тож ціль стоїть із запасом і на текст, і на неї.
 */
const IMAGE_TARGET_BYTES = 500 * 1024;
const IMAGE_ATTEMPTS = [
  { maxSize: 1280, quality: 0.7 },
  { maxSize: 1024, quality: 0.6 },
  { maxSize: 800, quality: 0.5 },
] as const;

/** Стискаємо доти, доки знімок не влізе в ціль, або доки не скінчаться спроби. */
const shrink = async (file: File): Promise<CompressedImage> => {
  let best = await compressImage(file, IMAGE_ATTEMPTS[0]);
  for (let i = 1; i < IMAGE_ATTEMPTS.length && best.bytes > IMAGE_TARGET_BYTES; i += 1) {
    best = await compressImage(file, IMAGE_ATTEMPTS[i]);
  }
  return best;
};

const FeedbackSheet: React.FC<FeedbackSheetProps> = ({ onClose, screen, error }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [image, setImage] = useState<CompressedImage | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setImageBusy(true);
    setFailure(null);
    try {
      setImage(await shrink(file));
    } catch {
      setFailure(t('feedback', 'errorImage'));
    } finally {
      setImageBusy(false);
      // Той самий файл інакше не вибереться вдруге: без скидання значення
      // `change` не спрацює.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const send = async () => {
    const message = text.trim();
    if (!message) {
      setFailure(t('feedback', 'errorEmpty'));
      return;
    }
    setSending(true);
    setFailure(null);

    const result: FeedbackResult = await sendFeedback({
      text: message,
      screen,
      error,
      image: image?.base64,
    });
    if (result.ok) {
      toast.show(t('feedback', 'sent'));
      onClose();
      return;
    }

    setSending(false);
    if (result.reason === 'rate_limited') setFailure(t('feedback', 'errorRateLimited'));
    else if (result.reason === 'not_configured') setFailure(t('feedback', 'errorUnavailable'));
    else if (result.reason === 'image_rejected') setFailure(t('feedback', 'errorImage'));
    else setFailure(t('feedback', 'errorFailed'));
  };

  const left = FEEDBACK_MAX_LENGTH - text.length;

  return (
    <FormSheet
      title={t('feedback', 'title')}
      onClose={onClose}
      onSubmit={() => void send()}
      submitLabel={t('feedback', 'send')}
      cancelLabel={t('feedback', 'cancel')}
      submitDisabled={sending || imageBusy || !text.trim()}
      error={failure ?? undefined}
    >
      <div className={formStyles.group}>
        <textarea
          className={styles.area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={FEEDBACK_MAX_LENGTH}
          placeholder={t('feedback', 'placeholder')}
          autoFocus
        />
      </div>

      {text.length >= COUNTER_FROM ? (
        <p className={`${styles.counter} ${left <= 20 ? styles.counterNearLimit : ''}`}>{left}</p>
      ) : null}

      {/* Знімок екрана пояснює зламане краще за будь-який опис, тож кнопка
          стоїть просто під полем, а не ховається за «додатково». */}
      {image ? (
        <div className={styles.thumb}>
          <img className={styles.thumbImage} src={image.dataUrl} alt={t('feedback', 'imageAlt')} />
          <button
            type="button"
            className={styles.thumbRemove}
            onClick={() => setImage(null)}
            aria-label={t('feedback', 'removeImage')}
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.attach}
          onClick={() => fileInputRef.current?.click()}
          disabled={imageBusy}
        >
          {imageBusy ? (
            <LoaderCircle size={18} className={styles.attachSpinner} />
          ) : (
            <ImagePlus size={18} />
          )}
          {t('feedback', 'addImage')}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className={styles.fileInput}
        onChange={(e) => void pickImage(e.target.files?.[0])}
      />

      <p className={formStyles.groupCaption}>{t('feedback', 'hint')}</p>
    </FormSheet>
  );
};

export default FeedbackSheet;
