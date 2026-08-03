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
  nav: { home: string; add: string; calendar: string; stats: string; subscriptions: string; settings: string };
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
    transfer: string;
  };
  range: { day: string; today: string; week: string; month: string; year: string; custom: string };
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
    sectionDebtOwedToMe: string;
    sectionDebtOwedByMe: string;
    debtDirectionLabel: string;
    debtDirectionOwedToMe: string;
    debtDirectionOwedByMe: string;
    debtPhraseOwedToMe: string;
    debtPhraseOwedByMe: string;
    debtSheetTitle: string;
    debtRecordPayment: string;
    debtPaymentAmountLabel: string;
    debtPaymentAmountPlaceholder: string;
    debtPaymentNoteLabel: string;
    debtPaymentNotePlaceholder: string;
    debtPaymentFailed: string;
    debtPaymentRecorded: string;
    debtDeleteConfirmWithBalance: string;
    debtRepaymentHistoryTitle: string;
    debtInitialAmount: string;
    debtPaidAmount: string;
    debtRemainingAmount: string;
    debtPaymentExceedsBalance: string;
    debtPaymentAccountRequired: string;
    liabilityLineLabel: string;
    close: string;
    confirm: string;
    editAriaLabel: string;
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
    templates: string;
    saveAsTemplate: string;
    templateNamePlaceholder: string;
    date: string;
    transferFrom: string;
    transferTo: string;
    transferSection: string;
    editNotFound: string;
    hintAmount: string;
    hintTransferAccounts: string;
    hintTransferDifferent: string;
    hintTransferDestination: string;
    dateToday: string;
    dateYesterday: string;
    repeatLast: string;
    editTemplates: string;
    cancelTemplate: string;
    saveTemplate: string;
    deleteTemplate: string;
  };
  history: {
    title: string;
    empty: string;
    deleteConfirm: string;
    edit: string;
    delete: string;
    back: string;
    filteredTitle: string;
    clearFilter: string;
  };
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
    defaultShiftTemplate: string;
    defaultShiftTemplateNone: string;
    defaultShiftTemplateAsk: string;
    defaultShiftTemplateWithout: string;
    defaultShiftTemplateHint: string;
    defaultShiftTemplateTap: string;
    defaultShiftTemplateNoTemplates: string;
    defaultShiftTemplateSaved: string;
    defaultShiftTemplateSaveFailed: string;
    dayShifts: string;
    dayShiftsEmpty: string;
    reportShiftBanners: string;
    reportShiftBannersEmpty: string;
    deleteShiftEntryConfirm: string;
    editShiftHoursPrompt: string;
    editShiftHoursInvalid: string;
    editShiftAmountPrompt: string;
    editShiftNotePrompt: string;
    monthReportTitle: string;
    dayReportTitle: string;
    yearReportTitle: string;
    customReportTitle: string;
    customRangeFrom: string;
    customRangeTo: string;
    reportHoursTotal: string;
    totalShifts: string;
    shiftsShort: string;
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
    category: string;
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
    delete: string;
    deleteConfirm: string;
    loadError: string;
    saveError: string;
    disabledSection: string;
    enable: string;
    back: string;
  };
  stats: {
    title: string;
    totalIncome: string;
    totalExpense: string;
    net: string;
    vsPrevious: string;
    insightsTitle: string;
    noInsights: string;
    insightTrend: string;
    insightGrowth: string;
    insightAnomaly: string;
    insightRecurring: string;
    previousPeriod: string;
    trendTitle: string;
    byCategory: string;
    categoriesWord: string;
    daysShort: string;
    noData: string;
    transactions: string;
    manageBudgets: string;
    prevPeriod: string;
    nextPeriod: string;
    goToToday: string;
    showCategory: string;
    hideCategory: string;
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
    automationTitle: string;
    weeklyAutoReport: string;
    monthlyAutoReport: string;
    reportSendTime: string;
    dailyReminder: string;
    subscriptionsReminder: string;
    reminderInactivity: string;
    reminderShiftEveningBefore: string;
    reminderShiftUnclosed: string;
    reminderFxChange: string;
    reminderTimeLabel: string;
    leadDaysLabel: string;
    fxThresholdLabel: string;
    sectionGeneral: string;
    sectionReports: string;
    sectionReminders: string;
    sectionPlanner: string;
    sectionBybit: string;
    bybitDescription: string;
    bybitLoading: string;
    bybitConnected: string;
    bybitNotConnected: string;
    bybitLoadError: string;
    bybitConnectError: string;
    bybitSyncError: string;
    bybitDisconnectError: string;
    bybitReadOnly: string;
    bybitLastSync: string;
    bybitImported: string;
    bybitNeverSynced: string;
    bybitSyncing: string;
    bybitSyncNow: string;
    bybitDisconnect: string;
    bybitDisconnectConfirm: string;
    bybitApiKeyPlaceholder: string;
    bybitApiSecretPlaceholder: string;
    bybitSecurityHint: string;
    bybitConnecting: string;
    bybitConnect: string;
    reminderGroupExpenses: string;
    reminderGroupPlanner: string;
    reminderGroupFx: string;
    reminderDescDaily: string;
    reminderDescSubscriptions: string;
    reminderDescInactivity: string;
    reminderDescShiftEvening: string;
    reminderDescShiftUnclosed: string;
    reminderDescFxChange: string;
    paramDaysBefore: string;
    paramInactivityDays: string;
    paramFxThreshold: string;
    saved: string;
    saveFailed: string;
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
    payFromAccount: string;
    payFromHint: string;
    fromAccountShort: string;
    accountMismatch: string;
    payFromUsdManual: string;
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
    transfer: string;
    other_income: string;
    other_expense: string;
    debt_return: string;
    balance_correction: string;
  };
  scan: {
    title: string;
    close: string;
    idleHint: string;
    takePhoto: string;
    processing: string;
    retake: string;
    saveConfirmed: string;
    reviewAndEdit: string;
    totalLabel: string;
    noTotalFound: string;
    unknownShop: string;
    itemsTitle: string;
    itemsMore: string;
    reviewTitle: string;
    reviewHint: string;
    reviewReasonNoText: string;
    reviewReasonMissingTotal: string;
    reviewReasonMissingShop: string;
    reviewReasonCurrency: string;
    reviewReasonPayment: string;
    reviewReasonManualCheck: string;
    ocrTextTitle: string;
    selectPaymentAccount: string;
    errorAuth: string;
    errorNotConfigured: string;
    errorRateLimited: string;
    errorRateLimitedRetry: string;
    errorTooLarge: string;
    errorInvalid: string;
    errorProvider: string;
    errorNetwork: string;
    errorUnknown: string;
  };
  stub: { title: string; description: string; openButton: string };
};

const uk: Dict = {
  nav: { home: 'Головна', add: 'Додати', calendar: 'Календар', stats: 'Статистика', subscriptions: 'Підписки', settings: 'Налаштування' },
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
    transfer: 'Переказ',
  },
  range: { day: 'День', today: 'Сьогодні', week: 'Тиждень', month: 'Місяць', year: 'Рік', custom: 'Період' },
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
    sectionDebtOwedToMe: 'Борг',
    sectionDebtOwedByMe: 'Я винен',
    debtDirectionLabel: 'Напрямок боргу',
    debtDirectionOwedToMe: 'Мені винні',
    debtDirectionOwedByMe: 'Я винен',
    debtPhraseOwedToMe: 'мені винні',
    debtPhraseOwedByMe: 'я винен',
    debtSheetTitle: 'Борг',
    debtRecordPayment: 'Записати повернення',
    debtPaymentAmountLabel: 'Сума повернення',
    debtPaymentAmountPlaceholder: 'до {amount}',
    debtPaymentNoteLabel: "Нотатка (необов'язково)",
    debtPaymentNotePlaceholder: 'Повернув готівкою...',
    debtPaymentFailed: 'Не вдалося зафіксувати. Спробуй ще раз.',
    debtPaymentRecorded: 'Зафіксовано',
    debtDeleteConfirmWithBalance: 'Цей борг ще не погашено повністю. Видалити рахунок разом із залишком боргу?',
    debtRepaymentHistoryTitle: 'Історія повернень',
    debtInitialAmount: 'Початкова сума',
    debtPaidAmount: 'Вже погашено',
    debtRemainingAmount: 'Прогрес погашення',
    debtPaymentExceedsBalance: 'Сума повернення не може перевищувати залишок боргу.',
    debtPaymentAccountRequired: 'Додай або вибери рахунок у цій валюті для руху грошей.',
    liabilityLineLabel: 'Я винен загалом',
    close: 'Закрити',
    confirm: 'Підтвердити',
    editAriaLabel: 'Редагувати',
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
    templates: 'Шаблони',
    saveAsTemplate: 'Зберегти як шаблон',
    templateNamePlaceholder: 'Назва шаблону',
    date: 'Дата',
    transferFrom: 'З рахунку',
    transferTo: 'На рахунок',
    transferSection: 'Переказ',
    editNotFound: 'Операцію не знайдено. Поверніться до історії.',
    hintAmount: 'Введіть суму більше нуля',
    hintTransferAccounts: 'Оберіть рахунки для переказу',
    hintTransferDifferent: 'Рахунки мають відрізнятися',
    hintTransferDestination: 'Введіть суму зарахування',
    dateToday: 'Сьогодні',
    dateYesterday: 'Вчора',
    repeatLast: 'Повторити останню',
    editTemplates: 'Редагувати шаблони',
    cancelTemplate: 'Скасувати',
    saveTemplate: 'Зберегти',
    deleteTemplate: 'Видалити шаблон {name}',
  },
  history: {
    title: 'Історія',
    empty: 'Операцій поки немає',
    deleteConfirm: 'Видалити цю операцію?',
    edit: 'Редагувати',
    delete: 'Видалити',
    back: 'На головну',
    filteredTitle: 'Відібрані операції',
    clearFilter: 'Показати всі',
  },
  planner: {
    title: 'Робочі зміни',
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
    defaultShiftTemplate: 'Шаблон за замовчуванням',
    defaultShiftTemplateNone: 'Не задано',
    defaultShiftTemplateAsk: 'Питати щоразу',
    defaultShiftTemplateWithout: 'Без шаблону',
    defaultShiftTemplateHint: 'Для Telegram: «почати зміну» стартує одразу з цим шаблоном.',
    defaultShiftTemplateTap: 'Натисніть, щоб обрати',
    defaultShiftTemplateNoTemplates: 'Спочатку збережіть шаблон: день у календарі → додати зміну → заповнити й зберегти.',
    defaultShiftTemplateSaved: 'Шаблон за замовчуванням збережено',
    defaultShiftTemplateSaveFailed: 'Не вдалося зберегти. Перевірте інтернет або оновіть застосунок.',
    dayShifts: 'Зміни за день',
    dayShiftsEmpty: 'Ще немає завершених змін за цей день',
    reportShiftBanners: 'Кожна зміна',
    reportShiftBannersEmpty: 'За цей період ще немає завершених змін',
    deleteShiftEntryConfirm: 'Видалити цю зміну зі звіту?',
    editShiftHoursPrompt: 'Години для зміни (ГГ:ХХ)',
    editShiftHoursInvalid: 'Введіть години у форматі ГГ:ХХ. Хвилини мають бути від 00 до 59.',
    editShiftAmountPrompt: 'Сума для зміни',
    editShiftNotePrompt: 'Назва/нотатка зміни',
    monthReportTitle: 'Звіт за місяць',
    dayReportTitle: 'Звіт за день',
    yearReportTitle: 'Звіт за рік',
    customReportTitle: 'Звіт за період',
    customRangeFrom: 'З',
    customRangeTo: 'До',
    reportHoursTotal: 'Відпрацьовано годин',
    totalShifts: 'Усього змін',
    shiftsShort: 'змін',
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
    category: 'Категорія',
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
    delete: 'Видалити',
    deleteConfirm: 'Видалити підписку назавжди? Цю дію не можна скасувати.',
    loadError: 'Не вдалося завантажити підписки. Спробуй пізніше.',
    saveError: 'Не вдалося зберегти підписку. Перевір з’єднання.',
    disabledSection: 'Вимкнені (залишились у базі)',
    enable: 'Увімкнути',
    back: 'На головну',
  },
  stats: {
    title: 'Статистика',
    totalIncome: 'Усього доходів',
    totalExpense: 'Усього витрат',
    net: 'Чистий результат',
    vsPrevious: 'до минулого періоду',
    insightsTitle: 'Інсайти',
    noInsights: 'Ще недостатньо даних для висновків',
    insightTrend: 'Тренд витрат',
    insightGrowth: 'Найшвидше зростає',
    insightAnomaly: 'Аномальна витрата',
    insightRecurring: 'Повторюється',
    previousPeriod: 'До минулого періоду',
    trendTitle: 'Динаміка',
    byCategory: 'За категоріями',
    categoriesWord: 'категорій',
    daysShort: 'дн',
    noData: 'Немає даних для цього періоду',
    transactions: 'операцій',
    manageBudgets: 'Налаштувати бюджети',
    prevPeriod: 'Попередній період',
    nextPeriod: 'Наступний період',
    goToToday: 'До поточного періоду',
    showCategory: 'Показати категорію',
    hideCategory: 'Сховати категорію',
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
    automationTitle: 'Автоматизація Telegram',
    weeklyAutoReport: 'Авто тижневий звіт',
    monthlyAutoReport: 'Авто місячний звіт',
    reportSendTime: 'Час надсилання звіту',
    dailyReminder: 'Щоденне нагадування',
    subscriptionsReminder: 'Нагадування про підписки',
    reminderInactivity: 'Немає витрат N днів',
    reminderShiftEveningBefore: 'Зміна завтра (планер)',
    reminderShiftUnclosed: 'Відкрита зміна >8 год',
    reminderFxChange: 'Зміна курсу валют (%)',
    reminderTimeLabel: 'Час у Telegram',
    leadDaysLabel: 'Днів / параметр',
    fxThresholdLabel: 'Поріг, % (для курсу)',
    sectionGeneral: 'Основне',
    sectionReports: 'Звіти Telegram',
    sectionReminders: 'Нагадування',
    sectionPlanner: 'Планер',
    sectionBybit: 'Автоматичні витрати',
    bybitDescription: 'Покупки з Bybit Card автоматично з’являються в історії. Під час першого підключення імпортуються операції за останні 7 днів.',
    bybitLoading: 'Перевіряємо підключення…',
    bybitConnected: 'Підключено й синхронізується автоматично',
    bybitNotConnected: 'Автоматичний імпорт покупок',
    bybitLoadError: 'Не вдалося завантажити стан Bybit.',
    bybitConnectError: 'Не вдалося підключити Bybit Card.',
    bybitSyncError: 'Не вдалося синхронізувати покупки.',
    bybitDisconnectError: 'Не вдалося відключити Bybit Card.',
    bybitReadOnly: 'лише читання',
    bybitLastSync: 'Остання синхронізація',
    bybitImported: 'Імпортовано',
    bybitNeverSynced: 'ще не було',
    bybitSyncing: 'Синхронізація…',
    bybitSyncNow: 'Синхронізувати',
    bybitDisconnect: 'Відключити',
    bybitDisconnectConfirm: 'Відключити Bybit Card? Уже імпортовані витрати залишаться.',
    bybitApiKeyPlaceholder: 'Вставте API Key',
    bybitApiSecretPlaceholder: 'Вставте API Secret',
    bybitSecurityHint: 'Ключ перевіряється як read-only і зберігається на сервері в зашифрованому вигляді.',
    bybitConnecting: 'Підключення…',
    bybitConnect: 'Підключити Bybit Card',
    reminderGroupExpenses: 'Витрати',
    reminderGroupPlanner: 'Планер змін',
    reminderGroupFx: 'Курс валют',
    reminderDescDaily: 'Нагадає ввечері внести витрати за день.',
    reminderDescSubscriptions: 'Попередить за кілька днів до списання підписки.',
    reminderDescInactivity: 'Напише, якщо кілька днів поспіль немає записів витрат.',
    reminderDescShiftEvening: 'Нагадає напередодні про заплановану зміну в планері.',
    reminderDescShiftUnclosed: 'Попередить, якщо зміна відкрита довше ніж 8 годин.',
    reminderDescFxChange: 'Повідомить, коли курс зміниться більше за поріг.',
    paramDaysBefore: 'Днів заздалегідь',
    paramInactivityDays: 'Днів без витрат',
    paramFxThreshold: 'Поріг, %',
    saved: 'Збережено',
    saveFailed: 'Не вдалося зберегти. Спробуйте ще раз.',
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
    payFromAccount: 'Зняти з рахунку',
    payFromHint:
      'Лише рахунки в тій самій валюті, що й ціль. З’явиться витрата в історії; при видаленні внеску вона теж зникне.',
    fromAccountShort: 'З рахунку',
    accountMismatch: 'Валюта рахунку не збігається з валютою цілі.',
    payFromUsdManual: 'Для цілі в USD рахунок не вибирається — лише ручний внесок.',
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
    transfer: 'Переказ',
    other_income: 'Інший дохід',
    other_expense: 'Інше',
    debt_return: 'Повернення боргу',
    balance_correction: 'Корекція балансу',
  },
  scan: {
    title: 'Сканер чека',
    close: 'Закрити',
    idleHint: 'Сфотографуйте паперовий чек — ми розпізнаємо магазин, суму і автоматично підкажемо категорію.',
    takePhoto: 'Сфотографувати чек',
    processing: 'Розпізнаємо чек…',
    retake: 'Зробити ще одне фото',
    saveConfirmed: 'Зберегти без змін',
    reviewAndEdit: 'Перевірити вручну',
    totalLabel: 'Сума чека',
    noTotalFound: 'Сума не знайдена',
    unknownShop: 'Магазин не визначено',
    itemsTitle: 'Позиції чека',
    itemsMore: '+ ще {n} позицій',
    reviewTitle: 'Потрібна ручна перевірка',
    reviewHint: 'Ми щось розпізнали, але цей чек краще перевірити перед збереженням.',
    reviewReasonNoText: 'OCR не зміг впевнено прочитати текст чека.',
    reviewReasonMissingTotal: 'Не вдалося надійно визначити підсумкову суму.',
    reviewReasonMissingShop: 'Магазин не вдалося визначити безпечно.',
    reviewReasonCurrency: 'Валюта визначена непевно або лише за евристикою.',
    reviewReasonPayment: 'Сума була скоригована за платіжним рядком і потребує перевірки.',
    reviewReasonManualCheck: 'У результаті є неочевидні ознаки, які краще перевірити вручну.',
    ocrTextTitle: 'Розпізнаний текст',
    selectPaymentAccount: 'Оберіть рахунок для списання',
    errorAuth: 'Сесію авторизації втрачено. Відкрийте застосунок з Telegram ще раз.',
    errorNotConfigured: 'Сканування чеків не налаштоване на сервері. Додайте OCR_SPACE_API_KEY у .env або увімкніть явний fallback.',
    errorRateLimited: 'Занадто часто. Зачекайте кілька секунд і спробуйте ще раз.',
    errorRateLimitedRetry: 'Повторіть спробу приблизно через {n} с.',
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
  nav: { home: 'Главная', add: 'Добавить', calendar: 'Календарь', stats: 'Статистика', subscriptions: 'Подписки', settings: 'Настройки' },
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
    transfer: 'Перевод',
  },
  range: { day: 'День', today: 'Сегодня', week: 'Неделя', month: 'Месяц', year: 'Год', custom: 'Период' },
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
    sectionDebtOwedToMe: 'Долг',
    sectionDebtOwedByMe: 'Я должен',
    debtDirectionLabel: 'Направление долга',
    debtDirectionOwedToMe: 'Мне должны',
    debtDirectionOwedByMe: 'Я должен',
    debtPhraseOwedToMe: 'мне должны',
    debtPhraseOwedByMe: 'я должен',
    debtSheetTitle: 'Долг',
    debtRecordPayment: 'Записать возврат',
    debtPaymentAmountLabel: 'Сумма возврата',
    debtPaymentAmountPlaceholder: 'до {amount}',
    debtPaymentNoteLabel: 'Заметка (необязательно)',
    debtPaymentNotePlaceholder: 'Вернул наличными...',
    debtPaymentFailed: 'Не удалось зафиксировать. Попробуй ещё раз.',
    debtPaymentRecorded: 'Зафиксировано',
    debtDeleteConfirmWithBalance: 'Этот долг ещё не погашен полностью. Удалить счёт вместе с остатком долга?',
    debtRepaymentHistoryTitle: 'История возвратов',
    debtInitialAmount: 'Начальная сумма',
    debtPaidAmount: 'Уже погашено',
    debtRemainingAmount: 'Прогресс погашения',
    debtPaymentExceedsBalance: 'Сумма возврата не может превышать остаток долга.',
    debtPaymentAccountRequired: 'Добавь или выбери счёт в этой валюте для движения денег.',
    liabilityLineLabel: 'Я должен всего',
    close: 'Закрыть',
    confirm: 'Подтвердить',
    editAriaLabel: 'Редактировать',
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
    templates: 'Шаблоны',
    saveAsTemplate: 'Сохранить как шаблон',
    templateNamePlaceholder: 'Название шаблона',
    date: 'Дата',
    transferFrom: 'Со счёта',
    transferTo: 'На счёт',
    transferSection: 'Перевод',
    editNotFound: 'Операция не найдена. Вернитесь в историю.',
    hintAmount: 'Введите сумму больше нуля',
    hintTransferAccounts: 'Выберите счета для перевода',
    hintTransferDifferent: 'Счета должны отличаться',
    hintTransferDestination: 'Введите сумму зачисления',
    dateToday: 'Сегодня',
    dateYesterday: 'Вчера',
    repeatLast: 'Повторить последнюю',
    editTemplates: 'Редактировать шаблоны',
    cancelTemplate: 'Отмена',
    saveTemplate: 'Сохранить',
    deleteTemplate: 'Удалить шаблон {name}',
  },
  history: {
    title: 'История',
    empty: 'Операций пока нет',
    deleteConfirm: 'Удалить эту операцию?',
    edit: 'Редактировать',
    delete: 'Удалить',
    back: 'На главную',
    filteredTitle: 'Отобранные операции',
    clearFilter: 'Показать все',
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
    defaultShiftTemplate: 'Шаблон по умолчанию',
    defaultShiftTemplateNone: 'Не задан',
    defaultShiftTemplateAsk: 'Спрашивать каждый раз',
    defaultShiftTemplateWithout: 'Без шаблона',
    defaultShiftTemplateHint: 'Для Telegram: «начать смену» сразу стартует с этим шаблоном.',
    defaultShiftTemplateTap: 'Нажмите, чтобы выбрать',
    defaultShiftTemplateNoTemplates: 'Сначала сохраните шаблон: день в календаре → добавить смену → заполнить и сохранить.',
    defaultShiftTemplateSaved: 'Шаблон по умолчанию сохранён',
    defaultShiftTemplateSaveFailed: 'Не удалось сохранить. Проверьте интернет или обновите приложение.',
    dayShifts: 'Смены за день',
    dayShiftsEmpty: 'За этот день пока нет завершённых смен',
    reportShiftBanners: 'Каждая смена',
    reportShiftBannersEmpty: 'За этот период пока нет завершённых смен',
    deleteShiftEntryConfirm: 'Удалить эту смену из отчёта?',
    editShiftHoursPrompt: 'Часы для смены (ЧЧ:ММ)',
    editShiftHoursInvalid: 'Введите часы в формате ЧЧ:ММ. Минуты должны быть от 00 до 59.',
    editShiftAmountPrompt: 'Сумма для смены',
    editShiftNotePrompt: 'Название/заметка смены',
    monthReportTitle: 'Отчёт за месяц',
    dayReportTitle: 'Отчёт за день',
    yearReportTitle: 'Отчёт за год',
    customReportTitle: 'Отчёт за период',
    customRangeFrom: 'С',
    customRangeTo: 'По',
    reportHoursTotal: 'Отработано часов',
    totalShifts: 'Всего смен',
    shiftsShort: 'смен',
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
    category: 'Категория',
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
    delete: 'Удалить',
    deleteConfirm: 'Удалить подписку навсегда? Это действие нельзя отменить.',
    loadError: 'Не удалось загрузить подписки. Попробуй позже.',
    saveError: 'Не удалось сохранить подписку. Проверь соединение.',
    disabledSection: 'Отключённые (в базе остаются)',
    enable: 'Включить',
    back: 'На главную',
  },
  stats: {
    title: 'Статистика',
    totalIncome: 'Всего доходов',
    totalExpense: 'Всего расходов',
    net: 'Чистый результат',
    vsPrevious: 'к прошлому периоду',
    insightsTitle: 'Инсайты',
    noInsights: 'Пока недостаточно данных для выводов',
    insightTrend: 'Тренд расходов',
    insightGrowth: 'Растёт быстрее всего',
    insightAnomaly: 'Аномальная трата',
    insightRecurring: 'Повторяется',
    previousPeriod: 'К прошлому периоду',
    trendTitle: 'Динамика',
    byCategory: 'По категориям',
    categoriesWord: 'категорий',
    daysShort: 'дн',
    noData: 'Нет данных за этот период',
    transactions: 'операций',
    manageBudgets: 'Настроить бюджеты',
    prevPeriod: 'Предыдущий период',
    nextPeriod: 'Следующий период',
    goToToday: 'К текущему периоду',
    showCategory: 'Показать категорию',
    hideCategory: 'Скрыть категорию',
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
    automationTitle: 'Автоматизация Telegram',
    weeklyAutoReport: 'Авто недельный отчёт',
    monthlyAutoReport: 'Авто месячный отчёт',
    reportSendTime: 'Время отправки отчёта',
    dailyReminder: 'Ежедневное напоминание',
    subscriptionsReminder: 'Напоминание о подписках',
    reminderInactivity: 'Нет расходов N дней',
    reminderShiftEveningBefore: 'Смена завтра (планер)',
    reminderShiftUnclosed: 'Смена открыта >8 ч',
    reminderFxChange: 'Изменение курса (%)',
    reminderTimeLabel: 'Время в Telegram',
    leadDaysLabel: 'Дней / параметр',
    fxThresholdLabel: 'Порог, %',
    sectionGeneral: 'Основное',
    sectionReports: 'Отчёты Telegram',
    sectionReminders: 'Напоминания',
    sectionPlanner: 'Планер',
    sectionBybit: 'Автоматические расходы',
    bybitDescription: 'Покупки с Bybit Card автоматически появляются в истории. При первом подключении импортируются операции за последние 7 дней.',
    bybitLoading: 'Проверяем подключение…',
    bybitConnected: 'Подключено и синхронизируется автоматически',
    bybitNotConnected: 'Автоматический импорт покупок',
    bybitLoadError: 'Не удалось загрузить состояние Bybit.',
    bybitConnectError: 'Не удалось подключить Bybit Card.',
    bybitSyncError: 'Не удалось синхронизировать покупки.',
    bybitDisconnectError: 'Не удалось отключить Bybit Card.',
    bybitReadOnly: 'только чтение',
    bybitLastSync: 'Последняя синхронизация',
    bybitImported: 'Импортировано',
    bybitNeverSynced: 'ещё не было',
    bybitSyncing: 'Синхронизация…',
    bybitSyncNow: 'Синхронизировать',
    bybitDisconnect: 'Отключить',
    bybitDisconnectConfirm: 'Отключить Bybit Card? Уже импортированные расходы останутся.',
    bybitApiKeyPlaceholder: 'Вставьте API Key',
    bybitApiSecretPlaceholder: 'Вставьте API Secret',
    bybitSecurityHint: 'Ключ проверяется как read-only и хранится на сервере в зашифрованном виде.',
    bybitConnecting: 'Подключение…',
    bybitConnect: 'Подключить Bybit Card',
    reminderGroupExpenses: 'Расходы',
    reminderGroupPlanner: 'Планер смен',
    reminderGroupFx: 'Курс валют',
    reminderDescDaily: 'Напомнит вечером записать расходы за день.',
    reminderDescSubscriptions: 'Предупредит за несколько дней до списания подписки.',
    reminderDescInactivity: 'Напишет, если несколько дней подряд нет записей расходов.',
    reminderDescShiftEvening: 'Напомнит накануне о запланированной смене в планере.',
    reminderDescShiftUnclosed: 'Предупредит, если смена открыта дольше 8 часов.',
    reminderDescFxChange: 'Сообщит, когда курс изменится больше порога.',
    paramDaysBefore: 'Дней заранее',
    paramInactivityDays: 'Дней без расходов',
    paramFxThreshold: 'Порог, %',
    saved: 'Сохранено',
    saveFailed: 'Не удалось сохранить. Попробуйте ещё раз.',
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
    payFromAccount: 'Списать со счёта',
    payFromHint:
      'Только счета в валюте цели. Появится расход в истории; при удалении взноса он тоже удалится.',
    fromAccountShort: 'Со счёта',
    accountMismatch: 'Валюта счёта не совпадает с валютой цели.',
    payFromUsdManual: 'Для цели в USD счёт не выбирается — только ручной взнос.',
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
    transfer: 'Перевод',
    other_income: 'Другой доход',
    other_expense: 'Другое',
    debt_return: 'Возврат долга',
    balance_correction: 'Корректировка баланса',
  },
  scan: {
    title: 'Сканер чека',
    close: 'Закрыть',
    idleHint: 'Сфотографируйте бумажный чек — мы распознаем магазин, сумму и автоматически подскажем категорию.',
    takePhoto: 'Сфотографировать чек',
    processing: 'Распознаём чек…',
    retake: 'Сделать ещё одно фото',
    saveConfirmed: 'Сохранить без изменений',
    reviewAndEdit: 'Проверить вручную',
    totalLabel: 'Сумма чека',
    noTotalFound: 'Сумма не найдена',
    unknownShop: 'Магазин не определён',
    itemsTitle: 'Позиции чека',
    itemsMore: '+ ещё {n} позиций',
    reviewTitle: 'Нужна ручная проверка',
    reviewHint: 'Часть данных распознана, но этот чек лучше проверить перед сохранением.',
    reviewReasonNoText: 'OCR не смог уверенно прочитать текст чека.',
    reviewReasonMissingTotal: 'Не удалось надёжно определить итоговую сумму.',
    reviewReasonMissingShop: 'Магазин не удалось безопасно определить.',
    reviewReasonCurrency: 'Валюта определена неуверенно или только эвристикой.',
    reviewReasonPayment: 'Сумма была скорректирована по платёжной строке и требует проверки.',
    reviewReasonManualCheck: 'В результате есть неочевидные признаки, которые лучше проверить вручную.',
    ocrTextTitle: 'Распознанный текст',
    selectPaymentAccount: 'Выберите счёт для списания',
    errorAuth: 'Сессия авторизации потеряна. Откройте приложение из Telegram ещё раз.',
    errorNotConfigured: 'Сканирование чеков не настроено на сервере. Добавьте OCR_SPACE_API_KEY в .env или включите явный fallback.',
    errorRateLimited: 'Слишком часто. Подождите несколько секунд и попробуйте снова.',
    errorRateLimitedRetry: 'Повторите попытку примерно через {n} с.',
    errorTooLarge: 'Файл слишком большой. Сделайте фото с меньшим качеством.',
    errorInvalid: 'Не удалось прочитать фото. Сфотографируйте ещё раз при лучшем освещении.',
    errorProvider: 'Сервис распознавания временно недоступен. Попробуйте позже.',
    errorNetwork: 'Нет соединения с сервером. Проверьте интернет.',
    errorUnknown: 'Что-то пошло не так. Попробуйте ещё раз.',
  },
  stub: {
    title: 'Только через Telegram',
    description:
      'Это приложение доступно только внутри нашего Telegram\u00A0бота. Откройте его в Telegram, чтобы продолжить.',
    openButton: 'Открыть в Telegram',
  },
};

const en: Dict = {
  nav: { home: 'Home', add: 'Add', calendar: 'Calendar', stats: 'Stats', subscriptions: 'Subscriptions', settings: 'Settings' },
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
    transfer: 'Transfer',
  },
  range: { day: 'Day', today: 'Today', week: 'Week', month: 'Month', year: 'Year', custom: 'Period' },
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
    sectionDebtOwedToMe: 'Debt',
    sectionDebtOwedByMe: 'I owe',
    debtDirectionLabel: 'Debt direction',
    debtDirectionOwedToMe: 'Owed to me',
    debtDirectionOwedByMe: 'I owe',
    debtPhraseOwedToMe: 'owed to me',
    debtPhraseOwedByMe: 'I owe',
    debtSheetTitle: 'Debt',
    debtRecordPayment: 'Record repayment',
    debtPaymentAmountLabel: 'Repayment amount',
    debtPaymentAmountPlaceholder: 'up to {amount}',
    debtPaymentNoteLabel: 'Note (optional)',
    debtPaymentNotePlaceholder: 'Repaid in cash...',
    debtPaymentFailed: "Couldn't record it. Try again.",
    debtPaymentRecorded: 'Recorded',
    debtDeleteConfirmWithBalance: "This debt isn't fully paid off yet. Delete it along with the outstanding balance?",
    debtRepaymentHistoryTitle: 'Repayment history',
    debtInitialAmount: 'Initial amount',
    debtPaidAmount: 'Already repaid',
    debtRemainingAmount: 'Repayment progress',
    debtPaymentExceedsBalance: 'The repayment cannot exceed the outstanding balance.',
    debtPaymentAccountRequired: 'Add or select an account in this currency for the money movement.',
    liabilityLineLabel: 'Total owed by me',
    close: 'Close',
    confirm: 'Confirm',
    editAriaLabel: 'Edit',
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
    templates: 'Templates',
    saveAsTemplate: 'Save as template',
    templateNamePlaceholder: 'Template name',
    date: 'Date',
    transferFrom: 'From account',
    transferTo: 'To account',
    transferSection: 'Transfer',
    editNotFound: 'Transaction not found. Go back to history.',
    hintAmount: 'Enter an amount greater than zero',
    hintTransferAccounts: 'Select accounts for the transfer',
    hintTransferDifferent: 'Accounts must be different',
    hintTransferDestination: 'Enter the credited amount',
    dateToday: 'Today',
    dateYesterday: 'Yesterday',
    repeatLast: 'Repeat last',
    editTemplates: 'Edit templates',
    cancelTemplate: 'Cancel',
    saveTemplate: 'Save',
    deleteTemplate: 'Delete template {name}',
  },
  history: {
    title: 'History',
    empty: 'No transactions yet',
    deleteConfirm: 'Delete this transaction?',
    edit: 'Edit',
    delete: 'Delete',
    back: 'Home',
    filteredTitle: 'Filtered transactions',
    clearFilter: 'Show all',
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
    defaultShiftTemplate: 'Default shift template',
    defaultShiftTemplateNone: 'Not set',
    defaultShiftTemplateAsk: 'Ask every time',
    defaultShiftTemplateWithout: 'Without template',
    defaultShiftTemplateHint: 'For Telegram: "start shift" begins immediately with this template.',
    defaultShiftTemplateTap: 'Tap to choose',
    defaultShiftTemplateNoTemplates: 'Save a template first: pick a day → add shift → fill in and save.',
    defaultShiftTemplateSaved: 'Default template saved',
    defaultShiftTemplateSaveFailed: 'Could not save. Check your connection or update the app.',
    dayShifts: 'Shifts for this day',
    dayShiftsEmpty: 'No completed shifts for this day yet',
    reportShiftBanners: 'Each shift',
    reportShiftBannersEmpty: 'No completed shifts in this period yet',
    deleteShiftEntryConfirm: 'Delete this shift from the report?',
    editShiftHoursPrompt: 'Hours for this shift (HH:MM)',
    editShiftHoursInvalid: 'Enter hours as HH:MM. Minutes must be between 00 and 59.',
    editShiftAmountPrompt: 'Amount for this shift',
    editShiftNotePrompt: 'Shift name/note',
    monthReportTitle: 'Monthly summary',
    dayReportTitle: 'Daily summary',
    yearReportTitle: 'Yearly summary',
    customReportTitle: 'Custom period',
    customRangeFrom: 'From',
    customRangeTo: 'To',
    reportHoursTotal: 'Hours worked',
    totalShifts: 'Total shifts',
    shiftsShort: 'shifts',
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
    category: 'Category',
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
    delete: 'Delete',
    deleteConfirm: 'Delete this subscription permanently? This cannot be undone.',
    loadError: 'Could not load subscriptions. Try again later.',
    saveError: 'Could not save subscription. Check your connection.',
    disabledSection: 'Disabled (still in database)',
    enable: 'Enable',
    back: 'Home',
  },
  stats: {
    title: 'Stats',
    totalIncome: 'Total income',
    totalExpense: 'Total expenses',
    net: 'Net',
    vsPrevious: 'vs previous period',
    insightsTitle: 'Insights',
    noInsights: 'Not enough data for insights yet',
    insightTrend: 'Spending trend',
    insightGrowth: 'Growing fastest',
    insightAnomaly: 'Anomalous spend',
    insightRecurring: 'Recurring hint',
    previousPeriod: 'Vs previous period',
    trendTitle: 'Trend',
    byCategory: 'By category',
    categoriesWord: 'categories',
    daysShort: 'd',
    noData: 'No data for this period',
    transactions: 'transactions',
    manageBudgets: 'Manage budgets',
    prevPeriod: 'Previous period',
    nextPeriod: 'Next period',
    goToToday: 'Go to current period',
    showCategory: 'Show category',
    hideCategory: 'Hide category',
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
    automationTitle: 'Telegram automation',
    weeklyAutoReport: 'Weekly auto report',
    monthlyAutoReport: 'Monthly auto report',
    reportSendTime: 'Report send time',
    dailyReminder: 'Daily reminder',
    subscriptionsReminder: 'Subscription reminder',
    reminderInactivity: 'No expenses for N days',
    reminderShiftEveningBefore: 'Shift tomorrow (planner)',
    reminderShiftUnclosed: 'Open shift >8h',
    reminderFxChange: 'FX rate change (%)',
    reminderTimeLabel: 'Telegram time',
    leadDaysLabel: 'Days / parameter',
    fxThresholdLabel: 'Threshold, %',
    sectionGeneral: 'General',
    sectionReports: 'Telegram reports',
    sectionReminders: 'Reminders',
    sectionPlanner: 'Planner',
    sectionBybit: 'Automatic expenses',
    bybitDescription: 'Bybit Card purchases appear in your history automatically. The first connection imports the last 7 days.',
    bybitLoading: 'Checking connection…',
    bybitConnected: 'Connected and syncing automatically',
    bybitNotConnected: 'Automatic purchase import',
    bybitLoadError: 'Could not load Bybit status.',
    bybitConnectError: 'Could not connect Bybit Card.',
    bybitSyncError: 'Could not sync purchases.',
    bybitDisconnectError: 'Could not disconnect Bybit Card.',
    bybitReadOnly: 'read only',
    bybitLastSync: 'Last sync',
    bybitImported: 'Imported',
    bybitNeverSynced: 'not yet',
    bybitSyncing: 'Syncing…',
    bybitSyncNow: 'Sync now',
    bybitDisconnect: 'Disconnect',
    bybitDisconnectConfirm: 'Disconnect Bybit Card? Already imported expenses will remain.',
    bybitApiKeyPlaceholder: 'Paste API Key',
    bybitApiSecretPlaceholder: 'Paste API Secret',
    bybitSecurityHint: 'The key is verified as read-only and stored encrypted on the server.',
    bybitConnecting: 'Connecting…',
    bybitConnect: 'Connect Bybit Card',
    reminderGroupExpenses: 'Expenses',
    reminderGroupPlanner: 'Shift planner',
    reminderGroupFx: 'FX rate',
    reminderDescDaily: 'Reminds you in the evening to log the day\u2019s expenses.',
    reminderDescSubscriptions: 'Warns you a few days before a subscription is charged.',
    reminderDescInactivity: 'Pings you if there are no expense entries for several days in a row.',
    reminderDescShiftEvening: 'Reminds you the day before a shift planned in the planner.',
    reminderDescShiftUnclosed: 'Warns you if a shift stays open longer than 8 hours.',
    reminderDescFxChange: 'Notifies you when the rate moves more than the threshold.',
    paramDaysBefore: 'Days ahead',
    paramInactivityDays: 'Days without expenses',
    paramFxThreshold: 'Threshold, %',
    saved: 'Saved',
    saveFailed: 'Could not save. Please try again.',
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
    payFromAccount: 'Debit an account',
    payFromHint:
      'Only accounts in the goal’s currency. Creates an expense in history; deleting the contribution removes it too.',
    fromAccountShort: 'From account',
    accountMismatch: 'Account currency does not match the goal currency.',
    payFromUsdManual: 'USD goals use manual contributions only (no account debit).',
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
    transfer: 'Transfer',
    other_income: 'Other income',
    other_expense: 'Other',
    debt_return: 'Debt return',
    balance_correction: 'Balance correction',
  },
  scan: {
    title: 'Receipt Scan',
    close: 'Close',
    idleHint: 'Take a photo of a paper receipt — we will detect the shop, total, and suggest a category.',
    takePhoto: 'Take receipt photo',
    processing: 'Reading receipt…',
    retake: 'Take another photo',
    saveConfirmed: 'Save as scanned',
    reviewAndEdit: 'Review manually',
    totalLabel: 'Receipt total',
    noTotalFound: 'Total not found',
    unknownShop: 'Shop not detected',
    itemsTitle: 'Receipt items',
    itemsMore: '+ {n} more items',
    reviewTitle: 'Manual review required',
    reviewHint: 'We parsed part of the receipt, but this result should be checked before saving.',
    reviewReasonNoText: 'OCR could not confidently read the receipt text.',
    reviewReasonMissingTotal: 'The final total could not be determined reliably.',
    reviewReasonMissingShop: 'The merchant could not be identified safely.',
    reviewReasonCurrency: 'The currency is uncertain or inferred heuristically.',
    reviewReasonPayment: 'The total was adjusted using a payment line and should be verified.',
    reviewReasonManualCheck: 'This result has ambiguous signals and should be checked manually.',
    ocrTextTitle: 'Recognized text',
    selectPaymentAccount: 'Select the account to debit',
    errorAuth: 'Authorization expired. Open the app from Telegram again.',
    errorNotConfigured: 'Receipt OCR is not configured on the server. Add OCR_SPACE_API_KEY in .env or enable an explicit fallback.',
    errorRateLimited: 'Too many attempts. Wait a few seconds and try again.',
    errorRateLimitedRetry: 'Try again in about {n} s.',
    errorTooLarge: 'The file is too large. Retake the photo with lower quality.',
    errorInvalid: 'The photo could not be read. Try again with better lighting.',
    errorProvider: 'The recognition service is temporarily unavailable. Try again later.',
    errorNetwork: 'No connection to the server. Check your internet.',
    errorUnknown: 'Something went wrong. Try again.',
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
