import { describe, expect, it } from 'vitest';
import {
  extractCurrency,
  extractDate,
  extractItems,
  extractShop,
  extractTotal,
  parseReceipt,
  pickCategoryId,
} from './receipts.js';

describe('receipts parser', () => {
  describe('extractTotal', () => {
    it('finds total after Ukrainian keyword', () => {
      const text = `АТБ-Маркет\nХліб 22.50\nМолоко 38.90\nСУМА 61.40 грн`;
      expect(extractTotal(text)).toBeCloseTo(61.4, 2);
    });

    it('handles RAZEM (Polish) on the same line', () => {
      const text = `Biedronka\nMleko 4,99\nChleb 5,50\nRAZEM PLN 10,49`;
      expect(extractTotal(text)).toBeCloseTo(10.49, 2);
    });

    it('handles "ДО СПЛАТИ" with number on the next line', () => {
      const text = `Сільпо\nЯйця 45.00\nДО СПЛАТИ\n245,67 грн`;
      expect(extractTotal(text)).toBeCloseTo(245.67, 2);
    });

    it('falls back to largest number in tail when no keyword', () => {
      const text = `Shop\nA 1.00\nB 2.00\nC 99.99`;
      expect(extractTotal(text)).toBeCloseTo(99.99, 2);
    });

    it('parses thousands separator with space', () => {
      const text = `Магазин\nТовар 1 234,56\nИТОГО 1 234,56 грн`;
      expect(extractTotal(text)).toBeCloseTo(1234.56, 2);
    });

    it('returns null on empty input', () => {
      expect(extractTotal('')).toBeNull();
      expect(extractTotal(null)).toBeNull();
    });

    it('prefers SUMA PLN over PTU/VAT subtotal lines', () => {
      const text = [
        'CARREFOUR POLSKA',
        'Kwota PTU A 23,00% 2,94',
        'Kwota PTU C 05,00% 1,39',
        'SUMA PTU 4,33',
        'SUMA PLN 44,99',
      ].join('\n');
      expect(extractTotal(text)).toBeCloseTo(44.99, 2);
    });
  });

  describe('extractCurrency', () => {
    it('detects PLN', () => {
      expect(extractCurrency('Razem 10 PLN')).toBe('PLN');
      expect(extractCurrency('25 zł')).toBe('PLN');
    });

    it('detects UAH', () => {
      expect(extractCurrency('100 грн')).toBe('UAH');
      expect(extractCurrency('150 ₴')).toBe('UAH');
    });

    it('detects USD', () => {
      expect(extractCurrency('Total $42.00')).toBe('USD');
    });

    it('defaults to UAH', () => {
      expect(extractCurrency('No currency markers here')).toBe('UAH');
    });
  });

  describe('extractDate', () => {
    it('parses DD.MM.YYYY', () => {
      expect(extractDate('Дата: 15.03.2026')).toBe('2026-03-15');
    });

    it('parses YYYY-MM-DD', () => {
      expect(extractDate('Date 2026-04-30 14:22')).toBe('2026-04-30');
    });

    it('returns null when missing', () => {
      expect(extractDate('no date')).toBeNull();
    });
  });

  describe('extractShop', () => {
    it('finds known chain in header', () => {
      const text = `АТБ-Маркет\nм. Київ\n01.01.2026\nХліб 20.00`;
      expect(extractShop(text)).toMatch(/АТБ/i);
    });

    it('finds Polish chain', () => {
      expect(extractShop('Biedronka sp. z o.o.\nul. Marszałkowska 1')).toMatch(/Biedronka/i);
    });

    it('falls back to first sensible line', () => {
      const text = `Магазин на розi\nХліб 22.00\nСУМА 22.00`;
      expect(extractShop(text)).toMatch(/Магазин/);
    });
  });

  describe('extractItems', () => {
    it('parses simple item lines', () => {
      const text = `АТБ\nХліб білий 22.50\nМолоко 1л 38.90\nСУМА 61.40`;
      const items = extractItems(text);
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({ name: 'Хліб білий', amount: 22.5 });
      expect(items[1]).toEqual({ name: 'Молоко 1л', amount: 38.9 });
    });

    it('skips total/keyword lines', () => {
      const text = `Сільпо\nКаша 12.00\nИТОГО 12.00`;
      const items = extractItems(text);
      expect(items.map((i) => i.name)).toEqual(['Каша']);
    });

    it('returns empty when no item-like lines', () => {
      expect(extractItems('Just text')).toEqual([]);
    });
  });

  describe('pickCategoryId', () => {
    it('maps grocery chain to food', () => {
      expect(pickCategoryId('ATB Market', [])).toBe('food');
      expect(pickCategoryId('Biedronka', [])).toBe('food');
    });

    it('maps fuel station to transport', () => {
      expect(pickCategoryId('OKKO АЗС', [])).toBe('transport');
      expect(pickCategoryId('WOG', [])).toBe('transport');
    });

    it('maps pharmacy to health', () => {
      expect(pickCategoryId('Аптека Доброго дня', [])).toBe('health');
    });

    it('uses item keywords when shop is unknown', () => {
      const items = [
        { name: 'Хліб', amount: 20 },
        { name: 'Молоко', amount: 30 },
      ];
      expect(pickCategoryId('Random shop name', items)).toBe('food');
    });

    it('falls back to other_expense', () => {
      expect(pickCategoryId('Unknown', [{ name: 'Mystery item', amount: 5 }])).toBe('other_expense');
    });
  });

  describe('parseReceipt', () => {
    it('parses a complete ATB-style receipt', () => {
      const text = [
        'АТБ-Маркет',
        'м. Київ, вул. Шевченка 1',
        '15.03.2026 14:23',
        '',
        'Хліб білий 22.50',
        'Молоко 1л 38.90',
        '',
        'СУМА 61.40 грн',
      ].join('\n');
      const r = parseReceipt(text);
      expect(r.shop).toMatch(/АТБ/i);
      expect(r.total).toBeCloseTo(61.4, 2);
      expect(r.currency).toBe('UAH');
      expect(r.date).toBe('2026-03-15');
      expect(r.categoryId).toBe('food');
      expect(r.items.length).toBeGreaterThanOrEqual(2);
    });

    it('parses an OKKO fuel receipt', () => {
      const text = [
        'OKKO',
        'АЗС № 123',
        '20.04.2026 09:10',
        'A95 Євро 25,5л 1 234,56',
        'СУМА 1 234,56 грн',
      ].join('\n');
      const r = parseReceipt(text);
      expect(r.shop).toMatch(/OKKO/i);
      expect(r.total).toBeCloseTo(1234.56, 2);
      expect(r.categoryId).toBe('transport');
    });

    it('parses a Biedronka receipt with PLN', () => {
      const text = [
        'Biedronka sp. z o.o.',
        'ul. Marszałkowska 1',
        '30.04.2026',
        'Mleko 4,99',
        'Chleb razowy 5,50',
        'RAZEM PLN 10,49',
      ].join('\n');
      const r = parseReceipt(text);
      expect(r.shop).toMatch(/Biedronka/i);
      expect(r.total).toBeCloseTo(10.49, 2);
      expect(r.currency).toBe('PLN');
      expect(r.categoryId).toBe('food');
    });

    it('returns safe defaults on garbage input', () => {
      const r = parseReceipt('');
      expect(r.shop).toBeNull();
      expect(r.total).toBeNull();
      expect(r.currency).toBe('UAH');
      expect(r.date).toBeNull();
      expect(r.categoryId).toBe('other_expense');
      expect(r.items).toEqual([]);
    });

    it('parses Carrefour-like Polish receipt and ignores header/address rows', () => {
      const text = [
        'CARREFOUR POLSKA SP Z O.O.',
        '03-734 Warszawa ul. Targowa 72',
        'Nr res. BDO: 000009699',
        'NIP 9370008168',
        'PARAGON FISKALNY',
        'C_CHIPSY LYUKS 125G *13,89= 13,89 C',
        'A_CZEKOLADA MILKA 8 *8,49= 8,49 A',
        'A_NAPOJ MOGU MOGU 0 *4,99= 4,99 A',
        'SUMA PTU 4,33',
        'SUMA PLN 44,99',
        'Płatność Gotówka 50,00',
      ].join('\n');
      const r = parseReceipt(text);
      expect(r.shop).toMatch(/CARREFOUR/i);
      expect(r.currency).toBe('PLN');
      expect(r.total).toBeCloseTo(44.99, 2);
      expect(r.items.some((x) => /Warszawa|NIP|BDO/i.test(x.name))).toBe(false);
      expect(r.items.some((x) => /CHIPSY/i.test(x.name))).toBe(true);
    });
  });
});
