export const LANGUAGES = ['uk', 'ru', 'en'] as const;
export type Language = typeof LANGUAGES[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  uk: 'Українська',
  ru: 'Русский',
  en: 'English',
};

export const LANGUAGE_FLAGS: Record<Language, string> = {
  uk: '🇺🇦',
  ru: '🇷🇺',
  en: '🇬🇧',
};

type Dict = {
  nav: { home: string; calendar: string; stats: string; settings: string };
  dashboard: {
    greeting: string;
    recentTitle: string;
    seeAll: string;
    empty: string;
    addTransaction: string;
    searchPlaceholder: string;
    noResults: string;
  };
  quickActions: { add: string; income: string; expense: string; history: string };
  range: { today: string; week: string; month: string; all: string };
  balance: { label: string; income: string; expense: string };
  addTx: {
    title: string;
    cancel: string;
    save: string;
    expense: string;
    income: string;
    category: string;
    amountPlaceholder: string;
    note: string;
    notePlaceholder: string;
    customCategoryPlaceholder: string;
    addCategory: string;
    createCategory: string;
    chooseIcon: string;
    chooseColor: string;
    create: string;
  };
  history: { title: string; empty: string; deleteConfirm: string };
  planner: {
    title: string;
    subtitle: string;
    selectedDate: string;
    hasShift: string;
    salaryRate: string;
    salaryAmount: string;
    note: string;
    notePlaceholder: string;
    save: string;
    saved: string;
  };
  stats: {
    title: string;
    thisMonth: string;
    totalIncome: string;
    totalExpense: string;
    net: string;
    byCategory: string;
    noData: string;
    transactions: string;
  };
  settings: {
    title: string;
    language: string;
    languageDescription: string;
    display: string;
    fullscreen: string;
    fullscreenDescription: string;
    fullscreenUnsupported: string;
    about: string;
    version: string;
    openedFrom: string;
    telegram: string;
    browser: string;
  };
  categories: {
    food: string;
    transport: string;
    home: string;
    entertainment: string;
    health: string;
    salary: string;
    other_income: string;
    other_expense: string;
  };
  stub: { title: string; description: string; openButton: string };
};

const uk: Dict = {
  nav: { home: 'Головна', calendar: 'Календар', stats: 'Статистика', settings: 'Налаштування' },
  dashboard: {
    greeting: 'Привіт',
    recentTitle: 'Операції',
    seeAll: 'Усі',
    empty: 'Ще немає операцій. Додайте першу ↓',
    addTransaction: 'Додати операцію',
    searchPlaceholder: 'Шукати за категорією чи приміткою',
    noResults: 'Нічого не знайдено',
  },
  quickActions: { add: 'Додати', income: 'Дохід', expense: 'Витрата', history: 'Історія' },
  range: { today: 'Сьогодні', week: 'Тиждень', month: 'Місяць', all: 'Усі' },
  balance: { label: 'Баланс цього місяця', income: 'Доходи', expense: 'Витрати' },
  addTx: {
    title: 'Нова операція',
    cancel: 'Скасувати',
    save: 'Зберегти',
    expense: 'Витрата',
    income: 'Дохід',
    category: 'Категорія',
    amountPlaceholder: '0',
    note: 'Примітка',
    notePlaceholder: 'Необов’язково',
    customCategoryPlaceholder: 'Або введіть свою категорію',
    addCategory: 'Нова категорія',
    createCategory: 'Створити категорію',
    chooseIcon: 'Оберіть іконку',
    chooseColor: 'Оберіть колір',
    create: 'Створити',
  },
  history: {
    title: 'Історія',
    empty: 'Операцій поки немає',
    deleteConfirm: 'Видалити цю операцію?',
  },
  planner: {
    title: 'Календар',
    subtitle: 'Відмічайте зміни, ставку та зарплату по днях',
    selectedDate: 'Обрана дата',
    hasShift: 'Є зміна',
    salaryRate: 'Ставка за зміну',
    salaryAmount: 'Зарплата за день',
    note: 'Нотатка',
    notePlaceholder: 'Наприклад: нічна зміна',
    save: 'Зберегти',
    saved: 'Збережено',
  },
  stats: {
    title: 'Статистика',
    thisMonth: 'Цей місяць',
    totalIncome: 'Усього доходів',
    totalExpense: 'Усього витрат',
    net: 'Чистий результат',
    byCategory: 'За категоріями',
    noData: 'Немає даних для цього періоду',
    transactions: 'операцій',
  },
  settings: {
    title: 'Налаштування',
    language: 'Мова інтерфейсу',
    languageDescription: 'Оберіть мову, якою відображатиметься застосунок',
    display: 'Відображення',
    fullscreen: 'Повноекранний режим',
    fullscreenDescription: 'Розгортає застосунок на весь екран і приховує шапку Telegram',
    fullscreenUnsupported: 'Недоступно у вашій версії Telegram',
    about: 'Про застосунок',
    version: 'Версія',
    openedFrom: 'Відкрито з',
    telegram: 'Telegram',
    browser: 'Браузера',
  },
  categories: {
    food: 'Продукти',
    transport: 'Транспорт',
    home: 'Житло',
    entertainment: 'Розваги',
    health: "Здоров'я",
    salary: 'Зарплата',
    other_income: 'Інший дохід',
    other_expense: 'Інше',
  },
  stub: {
    title: 'Тільки через Telegram',
    description:
      'Цей застосунок доступний лише всередині нашого Telegram\u00A0бота. Відкрийте його в Telegram, щоб продовжити.',
    openButton: 'Відкрити в Telegram',
  },
};

const ru: Dict = {
  nav: { home: 'Главная', calendar: 'Календарь', stats: 'Статистика', settings: 'Настройки' },
  dashboard: {
    greeting: 'Привет',
    recentTitle: 'Операции',
    seeAll: 'Все',
    empty: 'Пока нет операций. Добавьте первую ↓',
    addTransaction: 'Добавить операцию',
    searchPlaceholder: 'Искать по категории или заметке',
    noResults: 'Ничего не найдено',
  },
  quickActions: { add: 'Добавить', income: 'Доход', expense: 'Расход', history: 'История' },
  range: { today: 'Сегодня', week: 'Неделя', month: 'Месяц', all: 'Все' },
  balance: { label: 'Баланс за этот месяц', income: 'Доходы', expense: 'Расходы' },
  addTx: {
    title: 'Новая операция',
    cancel: 'Отмена',
    save: 'Сохранить',
    expense: 'Расход',
    income: 'Доход',
    category: 'Категория',
    amountPlaceholder: '0',
    note: 'Заметка',
    notePlaceholder: 'Необязательно',
    customCategoryPlaceholder: 'Или введите свою категорию',
    addCategory: 'Новая категория',
    createCategory: 'Создать категорию',
    chooseIcon: 'Выберите иконку',
    chooseColor: 'Выберите цвет',
    create: 'Создать',
  },
  history: {
    title: 'История',
    empty: 'Операций пока нет',
    deleteConfirm: 'Удалить эту операцию?',
  },
  planner: {
    title: 'Календарь',
    subtitle: 'Отмечайте смены, ставку и зарплату по дням',
    selectedDate: 'Выбранная дата',
    hasShift: 'Есть смена',
    salaryRate: 'Ставка за смену',
    salaryAmount: 'Зарплата за день',
    note: 'Заметка',
    notePlaceholder: 'Например: ночная смена',
    save: 'Сохранить',
    saved: 'Сохранено',
  },
  stats: {
    title: 'Статистика',
    thisMonth: 'Этот месяц',
    totalIncome: 'Всего доходов',
    totalExpense: 'Всего расходов',
    net: 'Чистый результат',
    byCategory: 'По категориям',
    noData: 'Нет данных за этот период',
    transactions: 'операций',
  },
  settings: {
    title: 'Настройки',
    language: 'Язык интерфейса',
    languageDescription: 'Выберите язык, на котором будет отображаться приложение',
    display: 'Отображение',
    fullscreen: 'Полноэкранный режим',
    fullscreenDescription: 'Разворачивает приложение на весь экран и скрывает шапку Telegram',
    fullscreenUnsupported: 'Недоступно в вашей версии Telegram',
    about: 'О приложении',
    version: 'Версия',
    openedFrom: 'Открыто из',
    telegram: 'Telegram',
    browser: 'Браузера',
  },
  categories: {
    food: 'Продукты',
    transport: 'Транспорт',
    home: 'Жильё',
    entertainment: 'Развлечения',
    health: 'Здоровье',
    salary: 'Зарплата',
    other_income: 'Другой доход',
    other_expense: 'Другое',
  },
  stub: {
    title: 'Только через Telegram',
    description:
      'Это приложение доступно только внутри нашего Telegram\u00A0бота. Откройте его в Telegram, чтобы продолжить.',
    openButton: 'Открыть в Telegram',
  },
};

const en: Dict = {
  nav: { home: 'Home', calendar: 'Calendar', stats: 'Stats', settings: 'Settings' },
  dashboard: {
    greeting: 'Hello',
    recentTitle: 'Transactions',
    seeAll: 'See all',
    empty: 'No transactions yet. Add your first one ↓',
    addTransaction: 'Add transaction',
    searchPlaceholder: 'Search by category or note',
    noResults: 'Nothing found',
  },
  quickActions: { add: 'Add', income: 'Income', expense: 'Expense', history: 'History' },
  range: { today: 'Today', week: 'Week', month: 'Month', all: 'All' },
  balance: { label: 'This month', income: 'Income', expense: 'Expenses' },
  addTx: {
    title: 'New transaction',
    cancel: 'Cancel',
    save: 'Save',
    expense: 'Expense',
    income: 'Income',
    category: 'Category',
    amountPlaceholder: '0',
    note: 'Note',
    notePlaceholder: 'Optional',
    customCategoryPlaceholder: 'Or enter your own category',
    addCategory: 'New category',
    createCategory: 'Create category',
    chooseIcon: 'Choose icon',
    chooseColor: 'Choose color',
    create: 'Create',
  },
  history: {
    title: 'History',
    empty: 'No transactions yet',
    deleteConfirm: 'Delete this transaction?',
  },
  planner: {
    title: 'Calendar',
    subtitle: 'Track shifts, salary rate and pay by date',
    selectedDate: 'Selected date',
    hasShift: 'Has shift',
    salaryRate: 'Shift rate',
    salaryAmount: 'Daily salary',
    note: 'Note',
    notePlaceholder: 'Example: night shift',
    save: 'Save',
    saved: 'Saved',
  },
  stats: {
    title: 'Stats',
    thisMonth: 'This month',
    totalIncome: 'Total income',
    totalExpense: 'Total expenses',
    net: 'Net',
    byCategory: 'By category',
    noData: 'No data for this period',
    transactions: 'transactions',
  },
  settings: {
    title: 'Settings',
    language: 'Interface language',
    languageDescription: 'Choose the language the app is displayed in',
    display: 'Display',
    fullscreen: 'Fullscreen mode',
    fullscreenDescription: 'Expands the app to the whole screen and hides the Telegram header',
    fullscreenUnsupported: 'Not available in your version of Telegram',
    about: 'About',
    version: 'Version',
    openedFrom: 'Opened from',
    telegram: 'Telegram',
    browser: 'Browser',
  },
  categories: {
    food: 'Groceries',
    transport: 'Transport',
    home: 'Housing',
    entertainment: 'Entertainment',
    health: 'Health',
    salary: 'Salary',
    other_income: 'Other income',
    other_expense: 'Other',
  },
  stub: {
    title: 'Telegram only',
    description:
      'This app is only available inside our Telegram\u00A0bot. Please open it in Telegram to continue.',
    openButton: 'Open in Telegram',
  },
};

export const translations: Record<Language, Dict> = { uk, ru, en };

export const LOCALE_MAP: Record<Language, string> = {
  uk: 'uk-UA',
  ru: 'ru-RU',
  en: 'en-US',
};

export type CategoryKey = keyof Dict['categories'];
