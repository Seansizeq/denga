import type { Category } from '../types';

export const CATEGORIES: Category[] = [
  { id: 'food', name: 'Продукти', icon: 'ShoppingBag', color: '#FF9500' }, // Orange
  { id: 'transport', name: 'Транспорт', icon: 'Car', color: '#007AFF' },   // Blue
  { id: 'home', name: 'Житло', icon: 'Home', color: '#5856D6' },           // Indigo
  { id: 'entertainment', name: 'Розваги', icon: 'Coffee', color: '#AF52DE' }, // Purple
  { id: 'health', name: 'Здоров\'я', icon: 'Heart', color: '#FF2D55' },    // Pink
  { id: 'salary', name: 'Зарплата', icon: 'TrendingUp', color: '#34C759' }, // Green
  { id: 'other_income', name: 'Дохід (інше)', icon: 'TrendingUp', color: '#34C759' }, // Green
  { id: 'other_expense', name: 'Інше', icon: 'ShoppingBag', color: '#8E8E93' }, // Grey
];
