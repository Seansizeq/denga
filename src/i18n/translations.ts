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
  nav: { home: string; calendar: string; stats: string; subscriptions: string; settings: string };
  dashboard: {
    greeting: string;
    recentTitle: string;
    seeAll: string;
    empty: string;
    addTransaction: string;
    searchPlaceholder: string;
    noResults: string;
  };
  quickActions: {
    add: string;
    income: string;
    expense: string;
    history: string;
    subscriptions: string;
    scan: string;
    goals: string;
  };
  range: { day: string; today: string; week: string; month: string; year: string };
  balance: {
    label: string;
    income: string;
    expense: string;
    tapHint: string;
    monthChangeHint: string;
    moneySources: string;
    byCurrency: string;
    portfolioByCurrency: string;
    bySection: string;
    sectionBank: string;
    sectionCash: string;
    sectionCrypto: string;
    sectionDebt: string;
  };
  addTx: {
    title: string;
    editTitle: string;
    cancel: string;
    save: string;
    saveChanges: string;
    expense: string;
    income: string;
    category: string;
    amountPlaceholder: string;
    note: string;
    notePlaceholder: string;
    customCategoryPlaceholder: string;
    addCategory: string;
    createCategory: string;
    categoryTabSelect: string;
    categoryTabCreate: string;
    chooseIcon: string;
    chooseColor: string;
    create: string;
    deleteConfirm: string;
    saveFailed: string;
    paymentAccount: string;
    paymentAccountHint: string;
    paymentAccountNone: string;
  };
  history: { title: string; empty: string; deleteConfirm: string; edit: string; delete: string };
  planner: {
    title: string;
    subtitle: string;
    tabCalendar: string;
    tabSettings: string;
    monthHint: string;
    prevMonth: string;
    nextMonth: string;
    selectedDate: string;
    hasShift: string;
    tapAddShift: string;
    addShift: string;
    plannerSettings: string;
    currency: string;
    currencyUah: string;
    currencyPln: string;
    defaultWorkedHours: string;
    defaultSalaryRate: string;
    defaultSalaryAmount: string;
    generalSettings: string;
    autoCalcSalary: string;
    defaultValues: string;
    templates: string;
    applyTemplate: string;
    applyDefaults: string;
    workingDays: string;
    backupActions: string;
    exportSettings: string;
    importSettings: string;
    resetSettings: string;
    importSuccess: string;
    importError: string;
    datePreview: string;
    salaryRate: string;
    salaryAmount: string;
    note: string;
    notePlaceholder: string;
    report: string;
    today: string;
    filledDay: string;
    filledDays: string;
    workedHours: string;
    expectedSalary: string;
    expectedSalaryUah: string;
    expectedSalaryPln: string;
    loading: string;
    unsavedConfirm: string;
    save: string;
    saved: string;
    shiftTitle: string;
    shiftSymbolLabel: string;
    fullDay: string;
    timeStart: string;
    timeEnd: string;
    dismiss: string;
    editShift: string;
    deleteShift: string;
    deleteShiftConfirm: string;
    deleteTemplate: string;
    deleteTemplateConfirm: string;
    startShift: string;
    endShift: string;
    endShiftConfirm: string;
    shiftElapsed: string;
    hoursShort: string;
    minutesShort: string;
    chooseStartTemplate: string;
    startWithoutTemplate: string;
    dayShifts: string;
    dayShiftsEmpty: string;
    reportShiftBanners: string;
    reportShiftBannersEmpty: string;
    deleteShiftEntryConfirm: string;
    editShiftHoursPrompt: string;
    editShiftAmountPrompt: string;
    editShiftNotePrompt: string;
    monthReportTitle: string;
    dayReportTitle: string;
    yearReportTitle: string;
    reportHoursTotal: string;
    totalShifts: string;
    salaryForReportHint: string;
    shiftPayment: string;
  };
  subscriptions: {
    title: string;
    subtitle: string;
    monthlyTotal: string;
    yearlyTotal: string;
    activeCount: string;
    empty: string;
    addTitle: string;
    name: string;
    amount: string;
    cycle: string;
    monthly: string;
    yearly: string;
    yearlyForItem: string;
    nextChargeDate: string;
    note: string;
    add: string;
    edit: string;
    saveChanges: string;
    cancelEdit: string;
    disable: string;
    loadError: string;
    saveError: string;
    disabledSection: string;
    enable: string;
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
    hideCategory: string;
    showCategory: string;
  };
  settings: {
    title: string;
    language: string;
    languageDescription: string;
    currency: string;
    currencyDescription: string;
    currencyUah: string;
    currencyPln: string;
    currencyUsd: string;
    display: string;
    fullscreen: string;
    fullscreenDescription: string;
    fullscreenUnsupported: string;
    about: string;
    version: string;
    openedFrom: string;
    telegram: string;
    browser: string;
    fxRates: string;
    fxUpdatedAt: string;
    fxStatus: string;
    fxLive: string;
    fxCache: string;
    fxFallback: string;
    fxRefresh: string;
    automationTitle: string;
    weeklyAutoReport: string;
    monthlyAutoReport: string;
    reportSendTime: string;
    sendWeeklyNow: string;
    sendMonthlyNow: string;
    dailyReminder: string;
    subscriptionsReminder: string;
    reminderInactivity: string;
    reminderShiftEveningBefore: string;
    reminderShiftUnclosed: string;
    reminderFxChange: string;
    reminderTimeLabel: string;
    leadDaysLabel: string;
    fxThresholdLabel: string;
    budgetsLink: string;
  };
  budgets: {
    title: string;
    subtitle: string;
    monthlyLimit: string;
    currencyNote: string;
    noBudgetHint: string;
  };
  goals: {
    title: string;
    subtitle: string;
    empty: string;
    addGoal: string;
    name: string;
    target: string;
    currency: string;
    deadline: string;
    deadlineOptional: string;
    color: string;
    save: string;
    cancel: string;
    edit: string;
    delete: string;
    deleteConfirm: string;
    contribute: string;
    contributionAmount: string;
    contributionDate: string;
    contributionNote: string;
    contributionsTitle: string;
    noContributions: string;
    deleteContribConfirm: string;
    completed: string;
    daysLeft: string;
    overdue: string;
    remaining: string;
    loadError: string;
    saveError: string;
    back: string;
    archived: string;
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
  scan: {
    title: string;
    close: string;
    idleHint: string;
    takePhoto: string;
    processing: string;
    retake: string;
    confirmAndEdit: string;
    totalLabel: string;
    noTotalFound: string;
    unknownShop: string;
    noDate: string;
    itemsTitle: string;
    itemsMore: string;
    errorNotConfigured: string;
    errorRateLimited: string;
    errorTooLarge: string;
    errorInvalid: string;
    errorProvider: string;
    errorNetwork: string;
    errorUnknown: string;
  };
  stub: { title: string; description: string; openButton: string };
};

const uk: Dict = {
  nav: { home: 'Головна', calendar: 'Календар', stats: 'Статистика', subscriptions: 'Підписки', settings: 'Налаштування' },
  dashboard: {
    greeting: 'Привіт',
    recentTitle: 'Операції',
    seeAll: 'Усі',
    empty: 'Ще немає операцій. Додайте першу ↓',
    addTransaction: 'Додати операцію',
    searchPlaceholder: 'Шукати за категорією чи приміткою',
    noResults: 'Нічого не знайдено',
  },
  quickActions: {
    add: 'Додати',
    income: 'Дохід',
    expense: 'Витрата',
    history: 'Історія',
    subscriptions: 'Підписки',
    scan: 'Сканер чека',
    goals: 'Цілі',
  },
  range: { day: 'День', today: 'Сьогодні', week: 'Тиждень', month: 'Місяць', year: 'Рік' },
  balance: {
    label: 'Баланс цього місяця',
    income: 'Доходи',
    expense: 'Витрати',
    tapHint: 'Натисніть на суму, щоб побачити деталі',
    monthChangeHint: 'за 30 днів',
    moneySources: 'Звідки гроші',
    byCurrency: 'Баланс за валютами',
    portfolioByCurrency: 'Портфель за валютами',
    bySection: 'По розділах',
    sectionBank: 'Карти',
    sectionCash: 'Готівка',
    sectionCrypto: 'Акції та крипта',
    sectionDebt: 'Борг',
  },
  addTx: {
    title: 'Нова операція',
    editTitle: 'Редагування операції',
    cancel: 'Скасувати',
    save: 'Зберегти',
    saveChanges: 'Зберегти зміни',
    expense: 'Витрата',
    income: 'Дохід',
    category: 'Категорія',
    amountPlaceholder: '0',
    note: 'Примітка',
    notePlaceholder: 'Необов’язково',
    customCategoryPlaceholder: 'Або введіть свою категорію',
    addCategory: 'Нова категорія',
    createCategory: 'Створити категорію',
    categoryTabSelect: 'Вибрати',
    categoryTabCreate: 'Нова',
    chooseIcon: 'Оберіть іконку',
    chooseColor: 'Оберіть колір',
    create: 'Створити',
    deleteConfirm: 'Видалити цю категорію?',
    saveFailed: 'Не вдалося зберегти. Перевір з’єднання і спробуй ще раз.',
    paymentAccount: 'Рахунок',
    paymentAccountHint: 'Обери карту чи готівку — цей рахунок оновиться в «Рахунках»',
    paymentAccountNone: 'Не вказано',
  },
  history: {
    title: 'Історія',
    empty: 'Операцій поки немає',
    deleteConfirm: 'Видалити цю операцію?',
    edit: 'Редагувати',
    delete: 'Видалити',
  },
  planner: {
    title: 'Календар',
    subtitle: 'Відмічайте зміни, ставку та зарплату по днях',
    tabCalendar: 'Календар',
    tabSettings: 'Налаштування',
    monthHint: 'Оберіть місяць або гортайте стрілками',
    prevMonth: 'Попередній місяць',
    nextMonth: 'Наступний місяць',
    selectedDate: 'Обрана дата',
    hasShift: 'Є зміна',
    tapAddShift: 'Натисніть кнопку, щоб додати зміну на обраний день',
    addShift: 'Додати зміну',
    plannerSettings: 'Налаштування зміни',
    currency: 'Валюта',
    currencyUah: 'Гривня (₴)',
    currencyPln: 'Злотий (zł)',
    defaultWorkedHours: 'Години за замовчуванням',
    defaultSalaryRate: 'Ставка за замовчуванням',
    defaultSalaryAmount: 'Зарплата за замовчуванням',
    generalSettings: 'Загальні налаштування',
    autoCalcSalary: 'Автообчислення зарплати (години x ставка)',
    defaultValues: 'Значення за замовчуванням',
    templates: 'Шаблони зміни',
    applyTemplate: 'Застосувати шаблон',
    applyDefaults: 'Застосувати дефолт',
    workingDays: 'Робочі дні',
    backupActions: 'Резерв і скидання',
    exportSettings: 'Експорт налаштувань',
    importSettings: 'Імпорт налаштувань',
    resetSettings: 'Скинути налаштування',
    importSuccess: 'Налаштування імпортовано',
    importError: 'Помилка імпорту файлу',
    datePreview: 'Превʼю обраної дати',
    salaryRate: 'Ставка за зміну',
    salaryAmount: 'Зарплата за день',
    note: 'Нотатка',
    notePlaceholder: 'Наприклад: нічна зміна',
    report: 'Звіт',
    today: 'Сьогодні',
    filledDay: 'Заповнений день',
    filledDays: 'Заповнено днів',
    workedHours: 'Відпрацьовано годин',
    expectedSalary: 'Очікувана зарплата',
    expectedSalaryUah: 'Очікувана зарплата (₴)',
    expectedSalaryPln: 'Очікувана зарплата (zł)',
    loading: 'Завантаження...',
    unsavedConfirm: 'Є незбережені зміни. Продовжити без збереження?',
    save: 'Зберегти',
    saved: 'Збережено',
    shiftTitle: 'Зміна',
    shiftSymbolLabel: 'Символ',
    fullDay: 'Увесь день',
    timeStart: 'Початок',
    timeEnd: 'Кінець',
    dismiss: 'Закрити',
    editShift: 'Редагувати зміну',
    deleteShift: 'Видалити зміну',
    deleteShiftConfirm: 'Прибрати зміну з цього дня?',
    deleteTemplate: 'Видалити шаблон',
    deleteTemplateConfirm: 'Видалити цей шаблон зі списку?',
    startShift: 'Почати зміну',
    endShift: 'Завершити зміну',
    endShiftConfirm: 'Завершити зміну та зберегти години?',
    shiftElapsed: 'Триває',
    hoursShort: 'г',
    minutesShort: 'хв',
    chooseStartTemplate: 'Оберіть шаблон для старту',
    startWithoutTemplate: 'Почати без шаблону',
    dayShifts: 'Зміни за день',
    dayShiftsEmpty: 'Ще немає завершених змін за цей день',
    reportShiftBanners: 'Кожна зміна',
    reportShiftBannersEmpty: 'За цей період ще немає завершених змін',
    deleteShiftEntryConfirm: 'Видалити цю зміну зі звіту?',
    editShiftHoursPrompt: 'Години для зміни',
    editShiftAmountPrompt: 'Сума для зміни',
    editShiftNotePrompt: 'Назва/нотатка зміни',
    monthReportTitle: 'Звіт за місяць',
    dayReportTitle: 'Звіт за день',
    yearReportTitle: 'Звіт за рік',
    reportHoursTotal: 'Відпрацьовано годин',
    totalShifts: 'Усього змін',
    salaryForReportHint: 'Для звіту вкажіть ставку за годину або фіксовану суму за зміну. Валюта: гривня або злотий.',
    shiftPayment: 'Оплата за зміну',
  },
  subscriptions: {
    title: 'Підписки',
    subtitle: 'Контролюйте регулярні платежі та скільки йде щомісяця',
    monthlyTotal: 'За місяць',
    yearlyTotal: 'За рік',
    activeCount: 'Активних',
    empty: 'Немає підписок. Додайте першу нижче.',
    addTitle: 'Нова підписка',
    name: 'Назва',
    amount: 'Сума',
    cycle: 'Цикл',
    monthly: 'Щомісяця',
    yearly: 'Щороку',
    yearlyForItem: 'За рік',
    nextChargeDate: 'Наступне списання',
    note: 'Нотатка',
    add: 'Додати підписку',
    edit: 'Редагувати',
    saveChanges: 'Зберегти зміни',
    cancelEdit: 'Скасувати редагування',
    disable: 'Вимкнути',
    loadError: 'Не вдалося завантажити підписки. Спробуй пізніше.',
    saveError: 'Не вдалося зберегти підписку. Перевір з’єднання.',
    disabledSection: 'Вимкнені (залишились у базі)',
    enable: 'Увімкнути',
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
    hideCategory: 'Сховати категорію',
    showCategory: 'Показати категорію',
  },
  settings: {
    title: 'Налаштування',
    language: 'Мова інтерфейсу',
    languageDescription: 'Оберіть мову, якою відображатиметься застосунок',
    currency: 'Валюта відображення',
    currencyDescription: 'Оберіть валюту, в якій показуються суми в застосунку',
    currencyUah: 'Гривня (₴)',
    currencyPln: 'Злотий (zł)',
    currencyUsd: 'Долар ($)',
    display: 'Відображення',
    fullscreen: 'Повноекранний режим',
    fullscreenDescription: 'Розгортає застосунок на весь екран і приховує шапку Telegram',
    fullscreenUnsupported: 'Недоступно у вашій версії Telegram',
    about: 'Про застосунок',
    version: 'Версія',
    openedFrom: 'Відкрито з',
    telegram: 'Telegram',
    browser: 'Браузера',
    fxRates: 'Курси валют',
    fxUpdatedAt: 'Оновлено',
    fxStatus: 'Джерело',
    fxLive: 'Онлайн',
    fxCache: 'Кеш',
    fxFallback: 'Резервні',
    fxRefresh: 'Оновити курси',
    automationTitle: 'Автоматизація Telegram',
    weeklyAutoReport: 'Авто тижневий звіт',
    monthlyAutoReport: 'Авто місячний звіт',
    reportSendTime: 'Час надсилання звіту',
    sendWeeklyNow: 'Надіслати тижневий звіт зараз',
    sendMonthlyNow: 'Надіслати місячний звіт зараз',
    dailyReminder: 'Щоденне нагадування',
    subscriptionsReminder: 'Нагадування про підписки',
    reminderInactivity: 'Немає витрат N днів',
    reminderShiftEveningBefore: 'Зміна завтра (планер)',
    reminderShiftUnclosed: 'Відкрита зміна >8 год',
    reminderFxChange: 'Зміна курсу валют (%)',
    reminderTimeLabel: 'Час у Telegram',
    leadDaysLabel: 'Днів / параметр',
    fxThresholdLabel: 'Поріг, % (для курсу)',
    budgetsLink: 'Бюджети по категоріях',
  },
  budgets: {
    title: 'Бюджети',
    subtitle: 'Ліміт витрат на місяць по категорії (сповіщення в Telegram при 80% і 100%)',
    monthlyLimit: 'Ліміт / місяць',
    currencyNote: 'Суми в валюті відображення з налаштувань',
    noBudgetHint: '0 або порожньо — без ліміту',
  },
  goals: {
    title: 'Фінансові цілі',
    subtitle: 'Накопичення на відпустку, машину чи подушку безпеки — внесіть суми вручну.',
    empty: 'Ще немає цілей. Додайте першу — з’явиться шкала прогресу.',
    addGoal: 'Нова ціль',
    name: 'Назва',
    target: 'Цільова сума',
    currency: 'Валюта цілі',
    deadline: 'Дедлайн',
    deadlineOptional: 'Необов’язково',
    color: 'Колір',
    save: 'Зберегти',
    cancel: 'Скасувати',
    edit: 'Редагувати',
    delete: 'Видалити',
    deleteConfirm: 'Видалити цю ціль і всі внески?',
    contribute: 'Додати внесок',
    contributionAmount: 'Сума',
    contributionDate: 'Дата',
    contributionNote: 'Примітка',
    contributionsTitle: 'Внески',
    noContributions: 'Поки немає внесків',
    deleteContribConfirm: 'Видалити цей внесок?',
    completed: 'Готово',
    daysLeft: 'Залишилось {n} дн.',
    overdue: 'Прострочено',
    remaining: 'Залишилось',
    loadError: 'Не вдалося завантажити',
    saveError: 'Не вдалося зберегти',
    back: 'Назад',
    archived: 'Архів',
  },
  categories: {
    food: 'Продукти',
    transport: 'Транспорт',
    home: 'Житло',
    entertainment: 'Розваги',
    health: "Здоров'я",
    salary: 'Зарплата',
    other_income: 'Корекція балансу',
    other_expense: 'Інше',
  },
  scan: {
    title: 'Сканер чека',
    close: 'Закрити',
    idleHint: 'Сфотографуйте паперовий чек — ми розпізнаємо магазин, суму і автоматично підкажемо категорію.',
    takePhoto: 'Сфотографувати чек',
    processing: 'Розпізнаємо чек…',
    retake: 'Зробити ще одне фото',
    confirmAndEdit: 'Перевірити та зберегти',
    totalLabel: 'Сума чека',
    noTotalFound: 'Сума не знайдена',
    unknownShop: 'Магазин не визначено',
    noDate: 'Дата не визначена',
    itemsTitle: 'Позиції чека',
    itemsMore: '+ ще {n} позицій',
    errorNotConfigured: 'Сканування чеків поки не налаштоване на сервері. Додайте GOOGLE_CLOUD_VISION_API_KEY у .env.',
    errorRateLimited: 'Занадто часто. Зачекайте кілька секунд і спробуйте ще раз.',
    errorTooLarge: 'Файл занадто великий. Зробіть фото з меншою якістю.',
    errorInvalid: 'Не вдалося прочитати фото. Сфотографуйте ще раз при кращому освітленні.',
    errorProvider: 'Сервіс розпізнавання тимчасово недоступний. Спробуйте пізніше.',
    errorNetwork: 'Немає з’єднання з сервером. Перевірте інтернет.',
    errorUnknown: 'Щось пішло не так. Спробуйте ще раз.',
  },
  stub: {
    title: 'Тільки через Telegram',
    description:
      'Цей застосунок доступний лише всередині нашого Telegram\u00A0бота. Відкрийте його в Telegram, щоб продовжити.',
    openButton: 'Відкрити в Telegram',
  },
};

const ru: Dict = {
  nav: { home: 'Главная', calendar: 'Календарь', stats: 'Статистика', subscriptions: 'Подписки', settings: 'Настройки' },
  dashboard: {
    greeting: 'Привет',
    recentTitle: 'Операции',
    seeAll: 'Все',
    empty: 'Пока нет операций. Добавьте первую ↓',
    addTransaction: 'Добавить операцию',
    searchPlaceholder: 'Искать по категории или заметке',
    noResults: 'Ничего не найдено',
  },
  quickActions: {
    add: 'Добавить',
    income: 'Доход',
    expense: 'Расход',
    history: 'История',
    subscriptions: 'Подписки',
    scan: 'Сканер чека',
    goals: 'Цели',
  },
  range: { day: 'День', today: 'Сегодня', week: 'Неделя', month: 'Месяц', year: 'Год' },
  balance: {
    label: 'Баланс за этот месяц',
    income: 'Доходы',
    expense: 'Расходы',
    tapHint: 'Нажмите на сумму, чтобы увидеть детали',
    monthChangeHint: 'за 30 дней',
    moneySources: 'Откуда деньги',
    byCurrency: 'Баланс по валютам',
    portfolioByCurrency: 'Портфель по валютам',
    bySection: 'По разделам',
    sectionBank: 'Карты',
    sectionCash: 'Наличные',
    sectionCrypto: 'Акции и крипта',
    sectionDebt: 'Долг',
  },
  addTx: {
    title: 'Новая операция',
    editTitle: 'Редактирование операции',
    cancel: 'Отмена',
    save: 'Сохранить',
    saveChanges: 'Сохранить изменения',
    expense: 'Расход',
    income: 'Доход',
    category: 'Категория',
    amountPlaceholder: '0',
    note: 'Заметка',
    notePlaceholder: 'Необязательно',
    customCategoryPlaceholder: 'Или введите свою категорию',
    addCategory: 'Новая категория',
    createCategory: 'Создать категорию',
    categoryTabSelect: 'Выбрать',
    categoryTabCreate: 'Новая',
    chooseIcon: 'Выберите иконку',
    chooseColor: 'Выберите цвет',
    create: 'Создать',
    deleteConfirm: 'Удалить эту категорию?',
    saveFailed: 'Не удалось сохранить. Проверь соединение и попробуй снова.',
    paymentAccount: 'Счёт',
    paymentAccountHint: 'Выбери карту или наличные — этот счёт обновится в «Счетах»',
    paymentAccountNone: 'Не указано',
  },
  history: {
    title: 'История',
    empty: 'Операций пока нет',
    deleteConfirm: 'Удалить эту операцию?',
    edit: 'Редактировать',
    delete: 'Удалить',
  },
  planner: {
    title: 'Календарь',
    subtitle: 'Отмечайте смены, ставку и зарплату по дням',
    tabCalendar: 'Календарь',
    tabSettings: 'Настройки',
    monthHint: 'Выберите месяц или листайте стрелками',
    prevMonth: 'Предыдущий месяц',
    nextMonth: 'Следующий месяц',
    selectedDate: 'Выбранная дата',
    hasShift: 'Есть смена',
    tapAddShift: 'Нажмите кнопку, чтобы добавить смену на выбранный день',
    addShift: 'Добавить смену',
    plannerSettings: 'Настройки смены',
    currency: 'Валюта',
    currencyUah: 'Гривна (₴)',
    currencyPln: 'Злотый (zł)',
    defaultWorkedHours: 'Часы по умолчанию',
    defaultSalaryRate: 'Ставка по умолчанию',
    defaultSalaryAmount: 'Зарплата по умолчанию',
    generalSettings: 'Общие настройки',
    autoCalcSalary: 'Авторасчёт зарплаты (часы x ставка)',
    defaultValues: 'Значения по умолчанию',
    templates: 'Шаблоны смены',
    applyTemplate: 'Применить шаблон',
    applyDefaults: 'Применить значения по умолчанию',
    workingDays: 'Рабочие дни',
    backupActions: 'Резерв и сброс',
    exportSettings: 'Экспорт настроек',
    importSettings: 'Импорт настроек',
    resetSettings: 'Сбросить настройки',
    importSuccess: 'Настройки импортированы',
    importError: 'Ошибка импорта файла',
    datePreview: 'Превью выбранной даты',
    salaryRate: 'Ставка за смену',
    salaryAmount: 'Зарплата за день',
    note: 'Заметка',
    notePlaceholder: 'Например: ночная смена',
    report: 'Отчёт',
    today: 'Сегодня',
    filledDay: 'Заполненный день',
    filledDays: 'Заполнено дней',
    workedHours: 'Отработано часов',
    expectedSalary: 'Ожидаемая зарплата',
    expectedSalaryUah: 'Ожидаемая зарплата (₴)',
    expectedSalaryPln: 'Ожидаемая зарплата (zł)',
    loading: 'Загрузка...',
    unsavedConfirm: 'Есть несохранённые изменения. Продолжить без сохранения?',
    save: 'Сохранить',
    saved: 'Сохранено',
    shiftTitle: 'Смена',
    shiftSymbolLabel: 'Символ',
    fullDay: 'Весь день',
    timeStart: 'Начало',
    timeEnd: 'Конец',
    dismiss: 'Закрыть',
    editShift: 'Редактировать смену',
    deleteShift: 'Удалить смену',
    deleteShiftConfirm: 'Убрать смену с этого дня?',
    deleteTemplate: 'Удалить шаблон',
    deleteTemplateConfirm: 'Удалить этот шаблон из списка?',
    startShift: 'Начать смену',
    endShift: 'Закончить смену',
    endShiftConfirm: 'Закончить смену и сохранить часы?',
    shiftElapsed: 'Длится',
    hoursShort: 'ч',
    minutesShort: 'мин',
    chooseStartTemplate: 'Выберите шаблон для старта',
    startWithoutTemplate: 'Начать без шаблона',
    dayShifts: 'Смены за день',
    dayShiftsEmpty: 'За этот день пока нет завершённых смен',
    reportShiftBanners: 'Каждая смена',
    reportShiftBannersEmpty: 'За этот период пока нет завершённых смен',
    deleteShiftEntryConfirm: 'Удалить эту смену из отчёта?',
    editShiftHoursPrompt: 'Часы для смены',
    editShiftAmountPrompt: 'Сумма для смены',
    editShiftNotePrompt: 'Название/заметка смены',
    monthReportTitle: 'Отчёт за месяц',
    dayReportTitle: 'Отчёт за день',
    yearReportTitle: 'Отчёт за год',
    reportHoursTotal: 'Отработано часов',
    totalShifts: 'Всего смен',
    salaryForReportHint: 'Для отчёта укажите ставку за час или фиксированную сумму за смену. Валюта: гривна или злотый.',
    shiftPayment: 'Оплата за смену',
  },
  subscriptions: {
    title: 'Подписки',
    subtitle: 'Контролируйте регулярные платежи и расходы в месяц',
    monthlyTotal: 'За месяц',
    yearlyTotal: 'За год',
    activeCount: 'Активных',
    empty: 'Подписок пока нет. Добавьте первую ниже.',
    addTitle: 'Новая подписка',
    name: 'Название',
    amount: 'Сумма',
    cycle: 'Цикл',
    monthly: 'Ежемесячно',
    yearly: 'Ежегодно',
    yearlyForItem: 'За год',
    nextChargeDate: 'Следующее списание',
    note: 'Заметка',
    add: 'Добавить подписку',
    edit: 'Редактировать',
    saveChanges: 'Сохранить изменения',
    cancelEdit: 'Отменить редактирование',
    disable: 'Отключить',
    loadError: 'Не удалось загрузить подписки. Попробуй позже.',
    saveError: 'Не удалось сохранить подписку. Проверь соединение.',
    disabledSection: 'Отключённые (в базе остаются)',
    enable: 'Включить',
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
    hideCategory: 'Скрыть категорию',
    showCategory: 'Показать категорию',
  },
  settings: {
    title: 'Настройки',
    language: 'Язык интерфейса',
    languageDescription: 'Выберите язык, на котором будет отображаться приложение',
    currency: 'Валюта отображения',
    currencyDescription: 'Выберите валюту, в которой отображаются суммы в приложении',
    currencyUah: 'Гривна (₴)',
    currencyPln: 'Злотый (zł)',
    currencyUsd: 'Доллар ($)',
    display: 'Отображение',
    fullscreen: 'Полноэкранный режим',
    fullscreenDescription: 'Разворачивает приложение на весь экран и скрывает шапку Telegram',
    fullscreenUnsupported: 'Недоступно в вашей версии Telegram',
    about: 'О приложении',
    version: 'Версия',
    openedFrom: 'Открыто из',
    telegram: 'Telegram',
    browser: 'Браузера',
    fxRates: 'Курсы валют',
    fxUpdatedAt: 'Обновлено',
    fxStatus: 'Источник',
    fxLive: 'Онлайн',
    fxCache: 'Кэш',
    fxFallback: 'Резервные',
    fxRefresh: 'Обновить курсы',
    automationTitle: 'Автоматизация Telegram',
    weeklyAutoReport: 'Авто недельный отчёт',
    monthlyAutoReport: 'Авто месячный отчёт',
    reportSendTime: 'Время отправки отчёта',
    sendWeeklyNow: 'Отправить недельный отчёт сейчас',
    sendMonthlyNow: 'Отправить месячный отчёт сейчас',
    dailyReminder: 'Ежедневное напоминание',
    subscriptionsReminder: 'Напоминание о подписках',
    reminderInactivity: 'Нет расходов N дней',
    reminderShiftEveningBefore: 'Смена завтра (планер)',
    reminderShiftUnclosed: 'Смена открыта >8 ч',
    reminderFxChange: 'Изменение курса (%)',
    reminderTimeLabel: 'Время в Telegram',
    leadDaysLabel: 'Дней / параметр',
    fxThresholdLabel: 'Порог, %',
    budgetsLink: 'Бюджеты по категориям',
  },
  budgets: {
    title: 'Бюджеты',
    subtitle: 'Лимит расходов в месяц по категории (уведомления в Telegram при 80% и 100%)',
    monthlyLimit: 'Лимит / месяц',
    currencyNote: 'Суммы в валюте отображения из настроек',
    noBudgetHint: '0 — без лимита',
  },
  goals: {
    title: 'Финансовые цели',
    subtitle: 'Накопления на отпуск, машину или подушку безопасности — вносы вручную.',
    empty: 'Пока нет целей. Добавьте первую — появится шкала прогресса.',
    addGoal: 'Новая цель',
    name: 'Название',
    target: 'Целевая сумма',
    currency: 'Валюта цели',
    deadline: 'Дедлайн',
    deadlineOptional: 'Необязательно',
    color: 'Цвет',
    save: 'Сохранить',
    cancel: 'Отмена',
    edit: 'Изменить',
    delete: 'Удалить',
    deleteConfirm: 'Удалить эту цель и все взносы?',
    contribute: 'Добавить взнос',
    contributionAmount: 'Сумма',
    contributionDate: 'Дата',
    contributionNote: 'Заметка',
    contributionsTitle: 'Взносы',
    noContributions: 'Пока нет взносов',
    deleteContribConfirm: 'Удалить этот взнос?',
    completed: 'Готово',
    daysLeft: 'Осталось {n} дн.',
    overdue: 'Просрочено',
    remaining: 'Осталось',
    loadError: 'Не удалось загрузить',
    saveError: 'Не удалось сохранить',
    back: 'Назад',
    archived: 'Архив',
  },
  categories: {
    food: 'Продукты',
    transport: 'Транспорт',
    home: 'Жильё',
    entertainment: 'Развлечения',
    health: 'Здоровье',
    salary: 'Зарплата',
    other_income: 'Корекція балансу',
    other_expense: 'Другое',
  },
  scan: {
    title: 'Сканер чека',
    close: 'Закрити',
    idleHint: 'Сфотографуйте паперовий чек — ми розпізнаємо магазин, суму і автоматично підкажемо категорію.',
    takePhoto: 'Сфотографувати чек',
    processing: 'Розпізнаємо чек…',
    retake: 'Зробити ще одне фото',
    confirmAndEdit: 'Перевірити та зберегти',
    totalLabel: 'Сума чека',
    noTotalFound: 'Сума не знайдена',
    unknownShop: 'Магазин не визначено',
    noDate: 'Дата не визначена',
    itemsTitle: 'Позиції чека',
    itemsMore: '+ ще {n} позицій',
    errorNotConfigured: 'Сканування чеків поки не налаштоване на сервері. Додайте GOOGLE_CLOUD_VISION_API_KEY у .env.',
    errorRateLimited: 'Занадто часто. Зачекайте кілька секунд і спробуйте ще раз.',
    errorTooLarge: 'Файл занадто великий. Зробіть фото з меншою якістю.',
    errorInvalid: 'Не вдалося прочитати фото. Сфотографуйте ще раз при кращому освітленні.',
    errorProvider: 'Сервіс розпізнавання тимчасово недоступний. Спробуйте пізніше.',
    errorNetwork: 'Немає з’єднання з сервером. Перевірте інтернет.',
    errorUnknown: 'Щось пішло не так. Спробуйте ще раз.',
  },
  stub: {
    title: 'Только через Telegram',
    description:
      'Это приложение доступно только внутри нашего Telegram\u00A0бота. Откройте его в Telegram, чтобы продолжить.',
    openButton: 'Открыть в Telegram',
  },
};

const en: Dict = {
  nav: { home: 'Home', calendar: 'Calendar', stats: 'Stats', subscriptions: 'Subscriptions', settings: 'Settings' },
  dashboard: {
    greeting: 'Hello',
    recentTitle: 'Transactions',
    seeAll: 'See all',
    empty: 'No transactions yet. Add your first one ↓',
    addTransaction: 'Add transaction',
    searchPlaceholder: 'Search by category or note',
    noResults: 'Nothing found',
  },
  quickActions: {
    add: 'Add',
    income: 'Income',
    expense: 'Expense',
    history: 'History',
    subscriptions: 'Subscriptions',
    scan: 'Receipt scan',
    goals: 'Goals',
  },
  range: { day: 'Day', today: 'Today', week: 'Week', month: 'Month', year: 'Year' },
  balance: {
    label: 'This month',
    income: 'Income',
    expense: 'Expenses',
    tapHint: 'Tap amount to see details',
    monthChangeHint: '30 days',
    moneySources: 'Money sources',
    byCurrency: 'Balance by currency',
    portfolioByCurrency: 'Portfolio by currency',
    bySection: 'By section',
    sectionBank: 'Cards',
    sectionCash: 'Cash',
    sectionCrypto: 'Stocks & crypto',
    sectionDebt: 'Debt',
  },
  addTx: {
    title: 'New transaction',
    editTitle: 'Edit transaction',
    cancel: 'Cancel',
    save: 'Save',
    saveChanges: 'Save changes',
    expense: 'Expense',
    income: 'Income',
    category: 'Category',
    amountPlaceholder: '0',
    note: 'Note',
    notePlaceholder: 'Optional',
    customCategoryPlaceholder: 'Or enter your own category',
    addCategory: 'New category',
    createCategory: 'Create category',
    categoryTabSelect: 'Select',
    categoryTabCreate: 'New',
    chooseIcon: 'Choose icon',
    chooseColor: 'Choose color',
    create: 'Create',
    deleteConfirm: 'Delete this category?',
    saveFailed: 'Could not save. Check your connection and try again.',
    paymentAccount: 'Account',
    paymentAccountHint: 'Pick a card or cash — this account will update on Accounts',
    paymentAccountNone: 'Not set',
  },
  history: {
    title: 'History',
    empty: 'No transactions yet',
    deleteConfirm: 'Delete this transaction?',
    edit: 'Edit',
    delete: 'Delete',
  },
  planner: {
    title: 'Calendar',
    subtitle: 'Track shifts, salary rate and pay by date',
    tabCalendar: 'Calendar',
    tabSettings: 'Settings',
    monthHint: 'Pick month or use arrows to navigate',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    selectedDate: 'Selected date',
    hasShift: 'Has shift',
    tapAddShift: 'Tap the button to add a shift for selected day',
    addShift: 'Add shift',
    plannerSettings: 'Shift settings',
    currency: 'Currency',
    currencyUah: 'Hryvnia (₴)',
    currencyPln: 'Zloty (zł)',
    defaultWorkedHours: 'Default worked hours',
    defaultSalaryRate: 'Default shift rate',
    defaultSalaryAmount: 'Default daily salary',
    generalSettings: 'General settings',
    autoCalcSalary: 'Auto-calculate salary (hours x rate)',
    defaultValues: 'Default values',
    templates: 'Shift templates',
    applyTemplate: 'Apply template',
    applyDefaults: 'Apply defaults',
    workingDays: 'Working days',
    backupActions: 'Backup and reset',
    exportSettings: 'Export settings',
    importSettings: 'Import settings',
    resetSettings: 'Reset settings',
    importSuccess: 'Settings imported',
    importError: 'Failed to import file',
    datePreview: 'Selected date preview',
    salaryRate: 'Shift rate',
    salaryAmount: 'Daily salary',
    note: 'Note',
    notePlaceholder: 'Example: night shift',
    report: 'Report',
    today: 'Today',
    filledDay: 'Filled day',
    filledDays: 'Filled days',
    workedHours: 'Worked hours',
    expectedSalary: 'Expected salary',
    expectedSalaryUah: 'Expected salary (₴)',
    expectedSalaryPln: 'Expected salary (zł)',
    loading: 'Loading...',
    unsavedConfirm: 'You have unsaved changes. Continue without saving?',
    save: 'Save',
    saved: 'Saved',
    shiftTitle: 'Shift',
    shiftSymbolLabel: 'Symbol',
    fullDay: 'All day',
    timeStart: 'Start',
    timeEnd: 'End',
    dismiss: 'Close',
    editShift: 'Edit shift',
    deleteShift: 'Remove shift',
    deleteShiftConfirm: 'Remove the shift from this day?',
    deleteTemplate: 'Delete template',
    deleteTemplateConfirm: 'Remove this template from the list?',
    startShift: 'Start shift',
    endShift: 'End shift',
    endShiftConfirm: 'End shift and save worked hours?',
    shiftElapsed: 'Elapsed',
    hoursShort: 'h',
    minutesShort: 'm',
    chooseStartTemplate: 'Choose a template to start',
    startWithoutTemplate: 'Start without template',
    dayShifts: 'Shifts for this day',
    dayShiftsEmpty: 'No completed shifts for this day yet',
    reportShiftBanners: 'Each shift',
    reportShiftBannersEmpty: 'No completed shifts in this period yet',
    deleteShiftEntryConfirm: 'Delete this shift from the report?',
    editShiftHoursPrompt: 'Hours for this shift',
    editShiftAmountPrompt: 'Amount for this shift',
    editShiftNotePrompt: 'Shift name/note',
    monthReportTitle: 'Monthly summary',
    dayReportTitle: 'Daily summary',
    yearReportTitle: 'Yearly summary',
    reportHoursTotal: 'Hours worked',
    totalShifts: 'Total shifts',
    salaryForReportHint: 'For the report: hourly rate or fixed amount per shift. Currency: hryvnia or zloty.',
    shiftPayment: 'Pay for this shift',
  },
  subscriptions: {
    title: 'Subscriptions',
    subtitle: 'Track recurring payments and monthly subscription spending',
    monthlyTotal: 'Per month',
    yearlyTotal: 'Per year',
    activeCount: 'Active',
    empty: 'No subscriptions yet. Add your first one below.',
    addTitle: 'New subscription',
    name: 'Name',
    amount: 'Amount',
    cycle: 'Cycle',
    monthly: 'Monthly',
    yearly: 'Yearly',
    yearlyForItem: 'Per year',
    nextChargeDate: 'Next charge date',
    note: 'Note',
    add: 'Add subscription',
    edit: 'Edit',
    saveChanges: 'Save changes',
    cancelEdit: 'Cancel editing',
    disable: 'Disable',
    loadError: 'Could not load subscriptions. Try again later.',
    saveError: 'Could not save subscription. Check your connection.',
    disabledSection: 'Disabled (still in database)',
    enable: 'Enable',
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
    hideCategory: 'Hide category',
    showCategory: 'Show category',
  },
  settings: {
    title: 'Settings',
    language: 'Interface language',
    languageDescription: 'Choose the language the app is displayed in',
    currency: 'Display currency',
    currencyDescription: 'Choose the currency used to display amounts in the app',
    currencyUah: 'Hryvnia (₴)',
    currencyPln: 'Zloty (zł)',
    currencyUsd: 'US Dollar ($)',
    display: 'Display',
    fullscreen: 'Fullscreen mode',
    fullscreenDescription: 'Expands the app to the whole screen and hides the Telegram header',
    fullscreenUnsupported: 'Not available in your version of Telegram',
    about: 'About',
    version: 'Version',
    openedFrom: 'Opened from',
    telegram: 'Telegram',
    browser: 'Browser',
    fxRates: 'FX rates',
    fxUpdatedAt: 'Updated',
    fxStatus: 'Source',
    fxLive: 'Live',
    fxCache: 'Cache',
    fxFallback: 'Fallback',
    fxRefresh: 'Refresh rates',
    automationTitle: 'Telegram automation',
    weeklyAutoReport: 'Weekly auto report',
    monthlyAutoReport: 'Monthly auto report',
    reportSendTime: 'Report send time',
    sendWeeklyNow: 'Send weekly report now',
    sendMonthlyNow: 'Send monthly report now',
    dailyReminder: 'Daily reminder',
    subscriptionsReminder: 'Subscription reminder',
    reminderInactivity: 'No expenses for N days',
    reminderShiftEveningBefore: 'Shift tomorrow (planner)',
    reminderShiftUnclosed: 'Open shift >8h',
    reminderFxChange: 'FX rate change (%)',
    reminderTimeLabel: 'Telegram time',
    leadDaysLabel: 'Days / parameter',
    fxThresholdLabel: 'Threshold, %',
    budgetsLink: 'Category budgets',
  },
  budgets: {
    title: 'Budgets',
    subtitle: 'Monthly spending limit per category (Telegram alerts at 80% and 100%)',
    monthlyLimit: 'Limit / month',
    currencyNote: 'Amounts in your display currency from settings',
    noBudgetHint: '0 — no limit',
  },
  goals: {
    title: 'Financial goals',
    subtitle: 'Save for vacation, a car, or an emergency fund — log contributions manually.',
    empty: 'No goals yet. Add one to see a progress bar.',
    addGoal: 'New goal',
    name: 'Name',
    target: 'Target amount',
    currency: 'Goal currency',
    deadline: 'Deadline',
    deadlineOptional: 'Optional',
    color: 'Color',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    deleteConfirm: 'Delete this goal and all contributions?',
    contribute: 'Add contribution',
    contributionAmount: 'Amount',
    contributionDate: 'Date',
    contributionNote: 'Note',
    contributionsTitle: 'Contributions',
    noContributions: 'No contributions yet',
    deleteContribConfirm: 'Delete this contribution?',
    completed: 'Done',
    daysLeft: '{n} days left',
    overdue: 'Overdue',
    remaining: 'Remaining',
    loadError: 'Failed to load',
    saveError: 'Failed to save',
    back: 'Back',
    archived: 'Archived',
  },
  categories: {
    food: 'Groceries',
    transport: 'Transport',
    home: 'Housing',
    entertainment: 'Entertainment',
    health: 'Health',
    salary: 'Salary',
    other_income: 'Корекція балансу',
    other_expense: 'Other',
  },
  scan: {
    title: 'Сканер чека',
    close: 'Закрити',
    idleHint: 'Сфотографуйте паперовий чек — ми розпізнаємо магазин, суму і автоматично підкажемо категорію.',
    takePhoto: 'Сфотографувати чек',
    processing: 'Розпізнаємо чек…',
    retake: 'Зробити ще одне фото',
    confirmAndEdit: 'Перевірити та зберегти',
    totalLabel: 'Сума чека',
    noTotalFound: 'Сума не знайдена',
    unknownShop: 'Магазин не визначено',
    noDate: 'Дата не визначена',
    itemsTitle: 'Позиції чека',
    itemsMore: '+ ще {n} позицій',
    errorNotConfigured: 'Сканування чеків поки не налаштоване на сервері. Додайте GOOGLE_CLOUD_VISION_API_KEY у .env.',
    errorRateLimited: 'Занадто часто. Зачекайте кілька секунд і спробуйте ще раз.',
    errorTooLarge: 'Файл занадто великий. Зробіть фото з меншою якістю.',
    errorInvalid: 'Не вдалося прочитати фото. Сфотографуйте ще раз при кращому освітленні.',
    errorProvider: 'Сервіс розпізнавання тимчасово недоступний. Спробуйте пізніше.',
    errorNetwork: 'Немає з’єднання з сервером. Перевірте інтернет.',
    errorUnknown: 'Щось пішло не так. Спробуйте ще раз.',
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
