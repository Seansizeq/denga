import PImage from 'pureimage';
import { existsSync } from 'fs';
import path from 'path';
import { PassThrough } from 'stream';
import { fileURLToPath } from 'url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

let fontsReady = false;
let regularFont = 'sans-serif';
let boldFont = 'sans-serif';

const ensureFonts = () => {
  if (fontsReady) return;
  const candidates = [
    {
      regular: path.resolve(moduleDir, '../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf'),
      bold: path.resolve(moduleDir, '../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'),
    },
    {
      regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    },
    {
      regular: 'C:/Windows/Fonts/arial.ttf',
      bold: 'C:/Windows/Fonts/arialbd.ttf',
    },
  ];

  for (const pair of candidates) {
    try {
      if (!existsSync(pair.regular) || !existsSync(pair.bold)) continue;
      PImage.registerFont(pair.regular, 'DengaReportRegular').loadSync();
      PImage.registerFont(pair.bold, 'DengaReportBold').loadSync();
      regularFont = 'DengaReportRegular';
      boldFont = 'DengaReportBold';
      fontsReady = true;
      return;
    } catch {
      // Try the next installed font pair.
    }
  }

  throw new Error('report font not available');
};

const encodePng = async (image) => {
  const output = new PassThrough();
  const chunks = [];
  output.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  await PImage.encodePNGToStream(image, output);
  return Buffer.concat(chunks);
};

const currencySymbol = (currency) => {
  if (currency === 'PLN') return 'zł';
  if (currency === 'USD') return '$';
  return '₴';
};

const formatAmount = (value) =>
  Math.abs(Number(value) || 0).toLocaleString('uk-UA', {
    maximumFractionDigits: 2,
  });

const signedAmount = (value, sign) =>
  `${Number(value) >= 0 ? '+' : '−'}${formatAmount(value)} ${sign}`;

export const renderFinancialReportCardPng = async ({
  reportType,
  periodLabel,
  summary,
  comparison,
  reportCurrency = 'UAH',
  topExpenses = [],
}) => {
  ensureFonts();

  const width = 1080;
  const height = 1350;
  const image = PImage.make(width, height);
  const ctx = image.getContext('2d');
  const sign = currencySymbol(reportCurrency);

  const colors = {
    background: '#0B0C10',
    surface: '#15171F',
    surfaceSoft: '#1B1E28',
    border: '#2A2E3B',
    text: '#F7F8FA',
    muted: '#969CAA',
    green: '#50D890',
    red: '#FF6B78',
    purple: '#7C74F2',
    purpleSoft: '#34305E',
    track: '#292C36',
  };

  const setFont = (size, bold = false) => {
    ctx.font = `${size}pt ${bold ? boldFont : regularFont}`;
  };

  const fillRoundedShape = (x, y, w, h, radius, fill) => {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.fillStyle = fill;
    ctx.fillRect(x + r, y, w - r * 2, h);
    ctx.fillRect(x, y + r, w, h - r * 2);
    for (const [cx, cy] of [
      [x + r, y + r],
      [x + w - r, y + r],
      [x + r, y + h - r],
      [x + w - r, y + h - r],
    ]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const roundedRect = (x, y, w, h, radius, fill, stroke = null) => {
    if (stroke) {
      fillRoundedShape(x, y, w, h, radius, stroke);
      fillRoundedShape(x + 2, y + 2, w - 4, h - 4, Math.max(0, radius - 2), fill);
      return;
    }
    fillRoundedShape(x, y, w, h, radius, fill);
  };

  const fitText = (text, maxWidth, preferredSize, minSize = 20, bold = false) => {
    let size = preferredSize;
    setFont(size, bold);
    while (size > minSize && ctx.measureText(text).width > maxWidth) {
      size -= 2;
      setFont(size, bold);
    }
    return size;
  };

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#15122A';
  ctx.beginPath();
  ctx.arc(1010, 30, 310, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#101D1A';
  ctx.beginPath();
  ctx.arc(30, 1330, 260, 0, Math.PI * 2);
  ctx.fill();

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  ctx.fillStyle = colors.purple;
  setFont(16, true);
  ctx.fillText('DENGA · ФІНАНСИ', 64, 89);

  ctx.fillStyle = colors.text;
  setFont(45, true);
  ctx.fillText(reportType === 'weekly' ? 'Тиждень у цифрах' : 'Місяць у цифрах', 64, 160);

  ctx.fillStyle = colors.muted;
  setFont(23);
  ctx.fillText(periodLabel, 64, 205);

  roundedRect(64, 244, 952, 262, 34, colors.surface, colors.border);
  ctx.fillStyle = colors.muted;
  setFont(18, true);
  ctx.fillText('ЧИСТИЙ РЕЗУЛЬТАТ', 104, 304);

  const netText = signedAmount(summary.net, sign);
  ctx.fillStyle = summary.net >= 0 ? colors.green : colors.red;
  fitText(netText, 850, 64, 42, true);
  ctx.fillText(netText, 104, 400);

  const expenseDelta = Number(comparison?.expenseDelta) || 0;
  const comparisonText = expenseDelta === 0
    ? 'Витрати без змін до минулого періоду'
    : `Витрати ${expenseDelta < 0 ? 'зменшились' : 'зросли'} на ${formatAmount(expenseDelta)} ${sign}`;
  ctx.fillStyle = expenseDelta <= 0 ? colors.green : colors.red;
  setFont(20, true);
  ctx.fillText(expenseDelta <= 0 ? '↓' : '↑', 104, 462);
  ctx.fillStyle = colors.muted;
  fitText(comparisonText, 800, 19, 15);
  ctx.fillText(comparisonText, 140, 462);

  const metricWidth = 464;
  roundedRect(64, 534, metricWidth, 172, 28, colors.surfaceSoft, colors.border);
  roundedRect(552, 534, metricWidth, 172, 28, colors.surfaceSoft, colors.border);

  ctx.fillStyle = colors.muted;
  setFont(17, true);
  ctx.fillText('ДОХОДИ', 100, 584);
  ctx.fillText('ВИТРАТИ', 588, 584);

  const incomeText = `+${formatAmount(summary.income)} ${sign}`;
  const expenseText = `−${formatAmount(summary.expense)} ${sign}`;
  ctx.fillStyle = colors.green;
  fitText(incomeText, 390, 35, 23, true);
  ctx.fillText(incomeText, 100, 655);
  ctx.fillStyle = colors.red;
  fitText(expenseText, 390, 35, 23, true);
  ctx.fillText(expenseText, 588, 655);

  roundedRect(64, 734, 952, 504, 34, colors.surface, colors.border);
  ctx.fillStyle = colors.text;
  setFont(24, true);
  ctx.fillText('НАЙБІЛЬШІ ВИТРАТИ', 104, 795);

  const rows = topExpenses.slice(0, 4);
  const maxExpense = rows.reduce((max, item) => Math.max(max, Number(item.amount) || 0), 0);

  if (rows.length === 0) {
    ctx.fillStyle = colors.muted;
    setFont(23);
    ctx.fillText('За цей період витрат немає', 104, 900);
  } else {
    rows.forEach((item, index) => {
      const y = 866 + index * 88;
      const name = String(item.name || item.categoryId || 'Категорія');
      ctx.textAlign = 'left';
      ctx.fillStyle = colors.text;
      fitText(name, 510, 21, 16, true);
      ctx.fillText(name, 104, y);

      ctx.textAlign = 'right';
      ctx.fillStyle = colors.text;
      fitText(`${formatAmount(item.amount)} ${sign}`, 280, 20, 15, true);
      ctx.fillText(`${formatAmount(item.amount)} ${sign}`, 976, y);
      ctx.textAlign = 'left';

      roundedRect(104, y + 23, 872, 10, 5, colors.track);
      const ratio = maxExpense > 0 ? Math.max(0.04, Number(item.amount) / maxExpense) : 0;
      roundedRect(104, y + 23, Math.max(10, 872 * ratio), 10, 5, colors.purple);
    });
  }

  const transactionCount = (Number(summary.incomeCount) || 0) + (Number(summary.expenseCount) || 0);
  ctx.fillStyle = colors.muted;
  setFont(17);
  ctx.fillText(`${transactionCount} операцій`, 64, 1305);
  ctx.textAlign = 'right';
  ctx.fillText(reportType === 'weekly' ? 'Завершений тиждень' : 'Завершений місяць', 1016, 1305);

  return encodePng(image);
};
