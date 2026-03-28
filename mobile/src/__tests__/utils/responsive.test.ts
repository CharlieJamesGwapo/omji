import {
  scale,
  verticalScale,
  moderateScale,
  fontScale,
  isSmallDevice,
  isLargeDevice,
  getResponsivePadding,
  getResponsiveColumns,
  normalize,
  getCardWidth,
  deviceWidth,
  deviceHeight,
  BREAKPOINTS,
  RESPONSIVE,
} from '../../utils/responsive';

describe('Responsive Utilities', () => {
  describe('scale', () => {
    it('returns a number greater than 0 for positive input', () => {
      expect(scale(16)).toBeGreaterThan(0);
    });

    it('returns 0 for input of 0', () => {
      expect(scale(0)).toBe(0);
    });

    it('scales proportionally (double input = double output)', () => {
      const single = scale(10);
      const double = scale(20);
      expect(double).toBeCloseTo(single * 2, 5);
    });
  });

  describe('verticalScale', () => {
    it('returns a number greater than 0 for positive input', () => {
      expect(verticalScale(16)).toBeGreaterThan(0);
    });

    it('returns 0 for input of 0', () => {
      expect(verticalScale(0)).toBe(0);
    });

    it('scales proportionally', () => {
      const single = verticalScale(10);
      const double = verticalScale(20);
      expect(double).toBeCloseTo(single * 2, 5);
    });
  });

  describe('moderateScale', () => {
    it('returns a number greater than 0 for positive input', () => {
      expect(moderateScale(16)).toBeGreaterThan(0);
    });

    it('uses default factor of 0.5', () => {
      const size = 20;
      const expected = size + (scale(size) - size) * 0.5;
      expect(moderateScale(size)).toBeCloseTo(expected, 5);
    });

    it('accepts custom factor parameter', () => {
      const size = 20;
      const factor = 0.8;
      const expected = size + (scale(size) - size) * factor;
      expect(moderateScale(size, factor)).toBeCloseTo(expected, 5);
    });

    it('returns original size when factor is 0', () => {
      expect(moderateScale(20, 0)).toBe(20);
    });

    it('returns fully scaled size when factor is 1', () => {
      const size = 20;
      expect(moderateScale(size, 1)).toBeCloseTo(scale(size), 5);
    });
  });

  describe('fontScale', () => {
    it('returns a number greater than 0 for positive input', () => {
      expect(fontScale(16)).toBeGreaterThan(0);
    });

    it('uses moderateScale with factor 0.3', () => {
      const size = 16;
      const expected = moderateScale(size, 0.3);
      expect(fontScale(size)).toBeCloseTo(expected, 5);
    });
  });

  describe('device dimensions', () => {
    it('exports positive deviceWidth', () => {
      expect(deviceWidth).toBeGreaterThan(0);
    });

    it('exports positive deviceHeight', () => {
      expect(deviceHeight).toBeGreaterThan(0);
    });
  });

  describe('isSmallDevice', () => {
    it('returns a boolean', () => {
      expect(typeof isSmallDevice()).toBe('boolean');
    });
  });

  describe('isLargeDevice', () => {
    it('returns a boolean', () => {
      expect(typeof isLargeDevice()).toBe('boolean');
    });
  });

  describe('getResponsivePadding', () => {
    it('returns a positive number for positive input', () => {
      expect(getResponsivePadding(20)).toBeGreaterThan(0);
    });
  });

  describe('getResponsiveColumns', () => {
    it('returns at least 1 column', () => {
      expect(getResponsiveColumns(2)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('normalize', () => {
    it('returns a positive number for positive input', () => {
      expect(normalize(16)).toBeGreaterThan(0);
    });

    it('returns value close to input (within 10%)', () => {
      const input = 16;
      const result = normalize(input);
      expect(result).toBeGreaterThanOrEqual(input * 0.9);
      expect(result).toBeLessThanOrEqual(input * 1.1);
    });
  });

  describe('getCardWidth', () => {
    it('returns a positive number', () => {
      expect(getCardWidth(2)).toBeGreaterThan(0);
    });

    it('returns smaller width with more columns', () => {
      const twoCols = getCardWidth(2);
      const threeCols = getCardWidth(3);
      expect(threeCols).toBeLessThan(twoCols);
    });

    it('accounts for padding and gap', () => {
      const padding = 20;
      const gap = 16;
      const columns = 2;
      const expected = (deviceWidth - padding * 2 - gap * (columns - 1)) / columns;
      expect(getCardWidth(columns, padding, gap)).toBeCloseTo(expected, 5);
    });
  });

  describe('BREAKPOINTS', () => {
    it('defines SMALL, MEDIUM, and LARGE breakpoints', () => {
      expect(BREAKPOINTS.SMALL).toBe(375);
      expect(BREAKPOINTS.MEDIUM).toBe(768);
      expect(BREAKPOINTS.LARGE).toBe(1024);
    });
  });

  describe('RESPONSIVE preset values', () => {
    it('has fontSize presets that are all positive numbers', () => {
      Object.values(RESPONSIVE.fontSize).forEach((size) => {
        expect(typeof size).toBe('number');
        expect(size).toBeGreaterThan(0);
      });
    });

    it('has iconSize presets that are all positive numbers', () => {
      Object.values(RESPONSIVE.iconSize).forEach((size) => {
        expect(typeof size).toBe('number');
        expect(size).toBeGreaterThan(0);
      });
    });

    it('has height presets that are all positive numbers', () => {
      Object.values(RESPONSIVE.height).forEach((size) => {
        expect(typeof size).toBe('number');
        expect(size).toBeGreaterThan(0);
      });
    });
  });
});
