import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { TelegramWindow } from '../types/telegram';
import { useGoBack } from '../hooks/useGoBack';

/**
 * Системна кнопка «назад» Telegram на всіх екранах, крім головного. Без неї
 * єдиний спосіб вийти з підекрану — знайти власну кнопку сторінки, яка є не
 * скрізь і поводиться по-різному.
 */
const TelegramBackButton: React.FC = () => {
  const { pathname } = useLocation();
  const goBack = useGoBack('/');
  const isRoot = pathname === '/';

  useEffect(() => {
    const backButton = (window as TelegramWindow).Telegram?.WebApp?.BackButton;
    if (!backButton?.show || !backButton.onClick) return;

    if (isRoot) {
      backButton.hide?.();
      return;
    }

    const handleClick = () => goBack();
    backButton.onClick(handleClick);
    backButton.show();

    return () => {
      backButton.offClick?.(handleClick);
      backButton.hide?.();
    };
  }, [isRoot, goBack]);

  return null;
};

export default TelegramBackButton;
