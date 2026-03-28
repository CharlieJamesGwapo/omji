import { renderHook, act } from '@testing-library/react-native';
import { usePromoCode } from '../../hooks/usePromoCode';
import { promoService } from '../../services/api';

// Mock the API service
jest.mock('../../services/api', () => ({
  promoService: {
    applyPromo: jest.fn(),
  },
}));

// Mock Toast component import (just types)
jest.mock('../../components/Toast', () => ({}));

const mockApplyPromo = promoService.applyPromo as jest.MockedFunction<typeof promoService.applyPromo>;
const mockShowToast = jest.fn();

const defaultOptions = {
  baseFare: 100,
  serviceType: 'rides' as const,
  showToast: mockShowToast,
  resetDeps: [10.0, 124.0],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('usePromoCode', () => {
  describe('initial state', () => {
    it('starts with empty promo code and no discount', () => {
      const { result } = renderHook(() => usePromoCode(defaultOptions));

      expect(result.current.promoCode).toBe('');
      expect(result.current.promoDiscount).toBe(0);
      expect(result.current.promoApplied).toBe(false);
      expect(result.current.applyingPromo).toBe(false);
    });
  });

  describe('setPromoCode', () => {
    it('updates the promo code value', () => {
      const { result } = renderHook(() => usePromoCode(defaultOptions));

      act(() => {
        result.current.setPromoCode('SAVE20');
      });

      expect(result.current.promoCode).toBe('SAVE20');
    });
  });

  describe('handleApplyPromo', () => {
    it('does nothing when promo code is empty', async () => {
      const { result } = renderHook(() => usePromoCode(defaultOptions));

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(mockApplyPromo).not.toHaveBeenCalled();
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('does nothing when promo code is whitespace only', async () => {
      const { result } = renderHook(() => usePromoCode(defaultOptions));

      act(() => {
        result.current.setPromoCode('   ');
      });

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(mockApplyPromo).not.toHaveBeenCalled();
    });

    it('shows warning when baseFare is 0', async () => {
      const { result } = renderHook(() =>
        usePromoCode({ ...defaultOptions, baseFare: 0 }),
      );

      act(() => {
        result.current.setPromoCode('SAVE20');
      });

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(mockShowToast).toHaveBeenCalledWith(
        'Select locations first to apply promo.',
        'warning',
      );
      expect(mockApplyPromo).not.toHaveBeenCalled();
    });

    it('shows warning when baseFare is negative', async () => {
      const { result } = renderHook(() =>
        usePromoCode({ ...defaultOptions, baseFare: -10 }),
      );

      act(() => {
        result.current.setPromoCode('SAVE20');
      });

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(mockShowToast).toHaveBeenCalledWith(
        'Select locations first to apply promo.',
        'warning',
      );
    });

    it('applies valid promo code successfully', async () => {
      mockApplyPromo.mockResolvedValueOnce({
        data: {
          success: true,
          data: { discount: 25 },
        },
      } as any);

      const { result } = renderHook(() => usePromoCode(defaultOptions));

      act(() => {
        result.current.setPromoCode('SAVE20');
      });

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(mockApplyPromo).toHaveBeenCalledWith('SAVE20', 100, 'rides');
      expect(result.current.promoDiscount).toBe(25);
      expect(result.current.promoApplied).toBe(true);
      expect(result.current.applyingPromo).toBe(false);
      expect(mockShowToast).toHaveBeenCalledWith('Promo applied! \u20B125 off', 'success');
    });

    it('trims whitespace from promo code before sending', async () => {
      mockApplyPromo.mockResolvedValueOnce({
        data: { success: true, data: { discount: 10 } },
      } as any);

      const { result } = renderHook(() => usePromoCode(defaultOptions));

      act(() => {
        result.current.setPromoCode('  SAVE20  ');
      });

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(mockApplyPromo).toHaveBeenCalledWith('SAVE20', 100, 'rides');
    });

    it('shows error when API returns success: false', async () => {
      mockApplyPromo.mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Promo code expired',
        },
      } as any);

      const { result } = renderHook(() => usePromoCode(defaultOptions));

      act(() => {
        result.current.setPromoCode('EXPIRED');
      });

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(result.current.promoApplied).toBe(false);
      expect(result.current.promoDiscount).toBe(0);
      expect(mockShowToast).toHaveBeenCalledWith('Promo code expired', 'error');
    });

    it('shows default error message when API returns success: false without error', async () => {
      mockApplyPromo.mockResolvedValueOnce({
        data: { success: false },
      } as any);

      const { result } = renderHook(() => usePromoCode(defaultOptions));

      act(() => {
        result.current.setPromoCode('INVALID');
      });

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(mockShowToast).toHaveBeenCalledWith('Invalid promo code', 'error');
    });

    it('shows warning when discount is 0', async () => {
      mockApplyPromo.mockResolvedValueOnce({
        data: {
          success: true,
          data: { discount: 0 },
        },
      } as any);

      const { result } = renderHook(() => usePromoCode(defaultOptions));

      act(() => {
        result.current.setPromoCode('ZERO');
      });

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(result.current.promoApplied).toBe(false);
      expect(mockShowToast).toHaveBeenCalledWith('Promo code is not valid.', 'warning');
    });

    it('handles network error from API', async () => {
      mockApplyPromo.mockRejectedValueOnce({
        response: { data: { error: 'Server unavailable' } },
      });

      const { result } = renderHook(() => usePromoCode(defaultOptions));

      act(() => {
        result.current.setPromoCode('SAVE20');
      });

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(result.current.promoApplied).toBe(false);
      expect(result.current.applyingPromo).toBe(false);
      expect(mockShowToast).toHaveBeenCalledWith('Server unavailable', 'error');
    });

    it('shows default error when error response has no message', async () => {
      mockApplyPromo.mockRejectedValueOnce({});

      const { result } = renderHook(() => usePromoCode(defaultOptions));

      act(() => {
        result.current.setPromoCode('SAVE20');
      });

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(mockShowToast).toHaveBeenCalledWith('Invalid promo code', 'error');
    });

    it('sets applyingPromo to true during API call', async () => {
      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockApplyPromo.mockReturnValueOnce(pendingPromise as any);

      const { result } = renderHook(() => usePromoCode(defaultOptions));

      act(() => {
        result.current.setPromoCode('SAVE20');
      });

      // Start the apply without waiting for completion
      let applyPromise: Promise<void>;
      act(() => {
        applyPromise = result.current.handleApplyPromo();
      });

      // Should be loading
      expect(result.current.applyingPromo).toBe(true);

      // Resolve the API call
      await act(async () => {
        resolvePromise!({ data: { success: true, data: { discount: 10 } } });
        await applyPromise!;
      });

      expect(result.current.applyingPromo).toBe(false);
    });

    it('passes correct serviceType for deliveries', async () => {
      mockApplyPromo.mockResolvedValueOnce({
        data: { success: true, data: { discount: 15 } },
      } as any);

      const { result } = renderHook(() =>
        usePromoCode({ ...defaultOptions, serviceType: 'deliveries' }),
      );

      act(() => {
        result.current.setPromoCode('DELIVER10');
      });

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(mockApplyPromo).toHaveBeenCalledWith('DELIVER10', 100, 'deliveries');
    });
  });

  describe('handleRemovePromo', () => {
    it('clears promo code, discount, and applied state', async () => {
      // First apply a promo
      mockApplyPromo.mockResolvedValueOnce({
        data: { success: true, data: { discount: 25 } },
      } as any);

      const { result } = renderHook(() => usePromoCode(defaultOptions));

      act(() => {
        result.current.setPromoCode('SAVE20');
      });

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(result.current.promoApplied).toBe(true);

      // Now remove
      act(() => {
        result.current.handleRemovePromo();
      });

      expect(result.current.promoCode).toBe('');
      expect(result.current.promoDiscount).toBe(0);
      expect(result.current.promoApplied).toBe(false);
    });
  });

  describe('resetDeps (auto-reset on dependency change)', () => {
    it('does not reset on first render', () => {
      const { result } = renderHook(() => usePromoCode(defaultOptions));

      // Even though resetDeps are set, no reset should happen on mount
      expect(result.current.promoCode).toBe('');
      expect(result.current.promoApplied).toBe(false);
    });

    it('resets applied promo when dependencies change', async () => {
      // Apply a promo first
      mockApplyPromo.mockResolvedValueOnce({
        data: { success: true, data: { discount: 25 } },
      } as any);

      let deps = [10.0, 124.0];
      const { result, rerender } = renderHook(
        (props) => usePromoCode(props),
        { initialProps: { ...defaultOptions, resetDeps: deps } },
      );

      act(() => {
        result.current.setPromoCode('SAVE20');
      });

      await act(async () => {
        await result.current.handleApplyPromo();
      });

      expect(result.current.promoApplied).toBe(true);
      expect(result.current.promoDiscount).toBe(25);

      // Change dependencies (e.g., user changed pickup location)
      rerender({
        ...defaultOptions,
        resetDeps: [11.0, 125.0],
      });

      expect(result.current.promoCode).toBe('');
      expect(result.current.promoDiscount).toBe(0);
      expect(result.current.promoApplied).toBe(false);
    });

    it('does not reset when promo is not applied and deps change', () => {
      let deps = [10.0, 124.0];
      const { result, rerender } = renderHook(
        (props) => usePromoCode(props),
        { initialProps: { ...defaultOptions, resetDeps: deps } },
      );

      // Set code but do not apply
      act(() => {
        result.current.setPromoCode('SAVE20');
      });

      // Change deps
      rerender({
        ...defaultOptions,
        resetDeps: [11.0, 125.0],
      });

      // promoCode should still be SAVE20 since promo was not applied
      expect(result.current.promoCode).toBe('SAVE20');
    });
  });
});
