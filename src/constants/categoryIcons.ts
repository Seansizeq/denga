import type { LucideIcon } from 'lucide-react';
import {
  ArrowRightLeft,
  BadgeDollarSign,
  Banknote,
  Bike,
  Book,
  Briefcase,
  Building2,
  Bus,
  Car,
  Circle,
  Coffee,
  Coins,
  Dog,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Hammer,
  HandCoins,
  Heart,
  Home,
  Landmark,
  Laptop,
  Music2,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Receipt,
  Sandwich,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Tag,
  TrendingUp,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
} from 'lucide-react';

/**
 * Іконки категорій, які вибираються за назвою під час рендера.
 *
 * Список явний навмисно. Доти тут стояв `import * as LucideIcons` і пошук у
 * ньому за рядком — через динамічний ключ бандлер не міг нічого викинути і
 * тягнув у головний чанк усю бібліотеку (півтори тисячі компонентів). Назви
 * приходять лише з `CATEGORIES` та `CUSTOM_CATEGORY_ICONS`, тож перелічити їх
 * тут коштує дешевше за мегабайт коду.
 */
const CATEGORY_ICONS = {
  ArrowRightLeft,
  BadgeDollarSign,
  Banknote,
  Bike,
  Book,
  Briefcase,
  Building2,
  Bus,
  Car,
  Circle,
  Coffee,
  Coins,
  Dog,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Hammer,
  HandCoins,
  Heart,
  Home,
  Landmark,
  Laptop,
  Music2,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Receipt,
  Sandwich,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Tag,
  TrendingUp,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
} satisfies Record<string, LucideIcon>;

export type CategoryIconName = keyof typeof CATEGORY_ICONS;

/** Невідома назва (стара кастомна категорія) отримує запасну іконку, не порожнечу. */
export const getCategoryIcon = (
  name: string | null | undefined,
  fallback: CategoryIconName = 'Tag',
): LucideIcon =>
  (name && CATEGORY_ICONS[name as CategoryIconName]) || CATEGORY_ICONS[fallback];
