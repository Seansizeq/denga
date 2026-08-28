import React, { useMemo } from 'react';
import styles from './ParticlesBackground.module.css';

interface Particle {
  id: number;
  x: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
  driftX: number;
}

const PARTICLE_COUNT = 22;

// Seeded pseudo-random so particles are stable across renders
function makeRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const PALETTE: [number, number, number][] = [
  [124, 92, 255],  // accent purple
  [155, 124, 255], // lilac
  [255, 255, 255], // white star
  [76, 168, 255],  // blue
];

const ParticlesBackground: React.FC = () => {
  const particles = useMemo<Particle[]>(() => {
    const rand = makeRand(31);
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const [r, g, b] = PALETTE[Math.floor(rand() * PALETTE.length)];
      const opacity = (0.12 + rand() * 0.28).toFixed(2);
      const color = `rgba(${r}, ${g}, ${b}, ${opacity})`;
      return {
        id: i,
        x: rand() * 100,
        size: 1.5 + rand() * 3.5,
        // Negative delay = particle already mid-flight at mount
        delay: -(rand() * 16),
        duration: 10 + rand() * 10,
        color,
        driftX: (rand() - 0.5) * 90,
      };
    });
  }, []);

  return (
    <div className={styles.layer} aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className={styles.particle}
          style={{
            left: `${p.x}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: p.color,
            boxShadow: `0 0 ${(p.size * 2).toFixed(1)}px ${p.size.toFixed(1)}px ${p.color}`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            '--drift-x': `${p.driftX}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
};

export default ParticlesBackground;
