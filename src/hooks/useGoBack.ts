import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * «Назад» означає назад — на екран, з якого прийшли. Раніше кожна сторінка
 * мала власну думку («на головну», «в статистику»), тож із історії чи цілей
 * користувача викидало не туди, звідки він зайшов.
 *
 * `fallback` спрацьовує лише коли повертатися нікуди (прямий вхід за
 * посиланням).
 */
export const useGoBack = (fallback = '/') => {
  const navigate = useNavigate();
  return useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
};
