import React from 'react';

/**
 * Остання перепона між помилкою в одному компоненті й білим екраном.
 *
 * React за замовчуванням розмонтовує **все** дерево, якщо рендер кинув
 * помилку. Для фінансового застосунку в Telegram це найгірший з можливих
 * наслідків: людина бачить порожнечу й не має ані пояснення, ані способу
 * повернутися — кнопки «оновити» у WebView немає.
 *
 * Межа навмисно стоїть навколо маршрутів, а не навколо всього застосунку:
 * нижня навігація лишається живою, тож зі зламаного екрана можна просто піти
 * на інший.
 */

interface Props {
  children: React.ReactNode;
  /** Показується замість зламаного піддерева. Отримує спробу перемонтувати. */
  fallback: (retry: () => void) => React.ReactNode;
  /** Зміна значення скидає межу — використовується для скидання при переході. */
  resetKey?: string;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(prevProps: Props) {
    // Перехід на інший екран — привід спробувати ще раз: зламався конкретний
    // маршрут, а не застосунок. Без цього межа лишалася б піднятою назавжди.
    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Консоль WebView доступна через відладку, і це єдиний слід, який лишається:
    // назовні ми помилку не шлемо.
    console.error('[ui] екран впав', error, info);
  }

  retry = () => this.setState({ failed: false });

  render() {
    if (this.state.failed) return this.props.fallback(this.retry);
    return this.props.children;
  }
}
