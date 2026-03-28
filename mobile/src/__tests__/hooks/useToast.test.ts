import { renderHook, act } from '@testing-library/react-native';
import { useToast } from '../../hooks/useToast';

// Mock the Toast component import (just the type)
jest.mock('../../components/Toast', () => ({}));

describe('useToast', () => {
  describe('initial state', () => {
    it('starts with visible false, empty message, and info type', () => {
      const { result } = renderHook(() => useToast());
      expect(result.current.toast).toEqual({
        visible: false,
        message: '',
        type: 'info',
      });
    });
  });

  describe('showToast', () => {
    it('sets visible to true with the given message and type', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast('Something went wrong', 'error');
      });

      expect(result.current.toast).toEqual({
        visible: true,
        message: 'Something went wrong',
        type: 'error',
      });
    });

    it('defaults type to info when not specified', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast('Informational message');
      });

      expect(result.current.toast).toEqual({
        visible: true,
        message: 'Informational message',
        type: 'info',
      });
    });

    it('handles success type', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast('Operation succeeded', 'success');
      });

      expect(result.current.toast.type).toBe('success');
      expect(result.current.toast.visible).toBe(true);
    });

    it('handles warning type', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast('Be careful', 'warning');
      });

      expect(result.current.toast.type).toBe('warning');
    });

    it('overwrites previous toast when called again', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast('First message', 'error');
      });

      act(() => {
        result.current.showToast('Second message', 'success');
      });

      expect(result.current.toast).toEqual({
        visible: true,
        message: 'Second message',
        type: 'success',
      });
    });
  });

  describe('hideToast', () => {
    it('sets visible to false while preserving message and type', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast('Error occurred', 'error');
      });

      act(() => {
        result.current.hideToast();
      });

      expect(result.current.toast.visible).toBe(false);
      // Message and type are preserved (for exit animations)
      expect(result.current.toast.message).toBe('Error occurred');
      expect(result.current.toast.type).toBe('error');
    });

    it('is safe to call when already hidden', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.hideToast();
      });

      expect(result.current.toast.visible).toBe(false);
    });
  });

  describe('function identity (useCallback)', () => {
    it('showToast and hideToast maintain stable references across renders', () => {
      const { result, rerender } = renderHook(() => useToast());

      const showRef = result.current.showToast;
      const hideRef = result.current.hideToast;

      rerender({});

      expect(result.current.showToast).toBe(showRef);
      expect(result.current.hideToast).toBe(hideRef);
    });
  });

  describe('show then hide flow', () => {
    it('supports a full show-then-hide lifecycle', () => {
      const { result } = renderHook(() => useToast());

      // Initially hidden
      expect(result.current.toast.visible).toBe(false);

      // Show
      act(() => {
        result.current.showToast('Hello!', 'info');
      });
      expect(result.current.toast.visible).toBe(true);
      expect(result.current.toast.message).toBe('Hello!');

      // Hide
      act(() => {
        result.current.hideToast();
      });
      expect(result.current.toast.visible).toBe(false);

      // Show again with different type
      act(() => {
        result.current.showToast('New message', 'success');
      });
      expect(result.current.toast.visible).toBe(true);
      expect(result.current.toast.message).toBe('New message');
      expect(result.current.toast.type).toBe('success');
    });
  });
});
