import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import styles from './RouteTransition.module.css';

/**
 * Екрани більше не підміняються ривком: при зміні маршруту вміст спливає
 * знизу з коротким проявленням.
 *
 * Клас знімається одразу після завершення анімації. Це не косметика: поки на
 * контейнері висить `transform`, він стає системою координат для будь-якого
 * `position: fixed` усередині — і плаваюча кнопка на головній почала б їхати
 * разом зі скролом.
 */
const RouteTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    setAnimating(true);
  }, [pathname]);

  return (
    <div
      className={animating ? styles.screenEntering : undefined}
      onAnimationEnd={() => setAnimating(false)}
    >
      {children}
    </div>
  );
};

export default RouteTransition;
