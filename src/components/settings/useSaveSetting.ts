import { useCallback, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useToast } from '../ui/Toast';
import { hapticLight, showAppAlert } from '../../utils/notify';

type RunOptions = {
  silent?: boolean;
  errorMessage?: string;
};

export const useSaveSetting = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const run = useCallback(
    async <T>(
      action: () => Promise<T>,
      onSuccess?: (value: T) => void,
      opts?: RunOptions,
    ): Promise<T | undefined> => {
      setSaving(true);
      try {
        const result = await action();
        onSuccess?.(result);
        hapticLight();
        if (!opts?.silent) toast.show(t('settings', 'saved'));
        return result;
      } catch {
        showAppAlert(opts?.errorMessage ?? t('settings', 'saveFailed'));
        return undefined;
      } finally {
        setSaving(false);
      }
    },
    [t, toast],
  );

  return { saving, run };
};
