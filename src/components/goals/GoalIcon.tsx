import React from 'react';
import { Target, Car, Plane, Shield, Home, Briefcase, Wallet, Heart, Gift } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const ICON_KEYS = ['target', 'car', 'plane', 'shield', 'home', 'briefcase', 'wallet', 'heart', 'gift'] as const;

export type GoalIconKey = (typeof ICON_KEYS)[number];

const ICON_MAP: Record<GoalIconKey, LucideIcon> = {
  target: Target,
  car: Car,
  plane: Plane,
  shield: Shield,
  home: Home,
  briefcase: Briefcase,
  wallet: Wallet,
  heart: Heart,
  gift: Gift,
};

export const isGoalIconKey = (name: string): name is GoalIconKey => ICON_KEYS.includes(name as GoalIconKey);

/** Невідомий ключ із бази не має ламати картку — падаємо на мішень. */
export const toGoalIconKey = (name: string): GoalIconKey => (isGoalIconKey(name) ? name : 'target');

const GoalIcon: React.FC<{ name: string; color: string; size?: number }> = ({ name, color, size = 22 }) => {
  const Icon = ICON_MAP[toGoalIconKey(name)];
  return <Icon size={size} strokeWidth={2} color={color} />;
};

export default GoalIcon;
