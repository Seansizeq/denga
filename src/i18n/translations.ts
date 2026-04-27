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
  quickActions: { add: string; income: string; expense: string; history: string; subscriptions: string };
  range: { day: string; today: string; week: string; month: string; year: string };
  balance: {
    label: string;
    income: string;
    expense: string;
    tapHint: string;
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
    monthReportTitle: string;
    dayReportTitle: string;
    yearReportTitle: string;
    reportHoursTotal: string;
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
  quickActions: { add: 'Додати', income: 'Дохід', expense: 'Витрата', history: 'Історія', subscriptions: 'Підписки' },
  range: { day: 'День', today: 'Сьогодні', week: 'Тиждень', month: 'Місяць', year: 'Рік' },
  balance: {
    label: 'Баланс цього місяця',
    income: 'Доходи',
    expense: 'Витрати',
    tapHint: 'Натисніть на суму, щоб побачити деталі',
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
    monthReportTitle: 'Звіт за місяць',
    dayReportTitle: 'Звіт за день',
    yearReportTitle: 'Звіт за рік',
    reportHoursTotal: 'Відпрацьовано годин',
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
  },
  categories: {
    food: 'Продукти',
    transport: 'Транспорт',
    home: 'Житло',
    entertainment: 'Розваги',
    health: "Здоров'я",
    salary: 'Зарплата',
    other_income: 'Корекція балансу',
    other_expense: 'Корекція балансу',
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
  quickActions: { add: 'Добавить', income: 'Доход', expense: 'Расход', history: 'История', subscriptions: 'Подписки' },
  range: { day: 'День', today: 'Сегодня', week: 'Неделя', month: 'Месяц', year: 'Год' },
  balance: {
    label: 'Баланс за этот месяц',
    income: 'Доходы',
    expense: 'Расходы',
    tapHint: 'Нажмите на сумму, чтобы увидеть детали',
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
    monthReportTitle: 'Отчёт за месяц',
    dayReportTitle: 'Отчёт за день',
    yearReportTitle: 'Отчёт за год',
    reportHoursTotal: 'Отработано часов',
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
  },
  categories: {
    food: 'Продукты',
    transport: 'Транспорт',
    home: 'Жильё',
    entertainment: 'Развлечения',
    health: 'Здоровье',
    salary: 'Зарплата',
    other_income: 'Корекція балансу',
    other_expense: 'Корекція балансу',
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
  quickActions: { add: 'Add', income: 'Income', expense: 'Expense', history: 'History', subscriptions: 'Subscriptions' },
  range: { day: 'Day', today: 'Today', week: 'Week', month: 'Month', year: 'Year' },
  balance: {
    label: 'This month',
    income: 'Income',
    expense: 'Expenses',
    tapHint: 'Tap amount to see details',
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
    monthReportTitle: 'Monthly summary',
    dayReportTitle: 'Daily summary',
    yearReportTitle: 'Yearly summary',
    reportHoursTotal: 'Hours worked',
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
  },
  categories: {
    food: 'Groceries',
    transport: 'Transport',
    home: 'Housing',
    entertainment: 'Entertainment',
    health: 'Health',
    salary: 'Salary',
    other_income: 'Корекція балансу',
    other_expense: 'Корекція балансу',
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
