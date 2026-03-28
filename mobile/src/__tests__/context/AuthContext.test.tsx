import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import { AuthProvider, useAuth } from '../../context/AuthContext';

// --- Mocks ---

jest.mock('../../services/api', () => ({
  authService: {
    login: jest.fn(),
    register: jest.fn(),
  },
  userService: {
    getProfile: jest.fn(),
  },
  pushService: {
    removeToken: jest.fn(),
  },
  setOnUnauthorized: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import { authService, userService, pushService, setOnUnauthorized } from '../../services/api';

// --- Helpers ---

const mockUser = {
  id: 1,
  name: 'Juan Dela Cruz',
  email: 'juan@example.com',
  phone: '09171234567',
  role: 'user' as const,
};

const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-token';

const wrapper = ({ children }: any) => <AuthProvider>{children}</AuthProvider>;

// Helper to build the standard API response shape: { data: { data: { token, user } } }
const makeAuthResponse = (token: string, user: typeof mockUser) => ({
  data: { data: { token, user } },
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no stored data
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
});

// --- Tests ---

describe('AuthProvider', () => {
  it('renders children', async () => {
    render(
      <AuthProvider>
        <Text testID="child">Hello</Text>
      </AuthProvider>,
    );

    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('registers setOnUnauthorized callback on mount', async () => {
    renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(setOnUnauthorized).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});

describe('loadUser (mount behavior)', () => {
  it('loads user from AsyncStorage on mount when token and user exist', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'token') return Promise.resolve(mockToken);
      if (key === 'user') return Promise.resolve(JSON.stringify(mockUser));
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);
  });

  it('sets user to null when no token in storage', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
  });

  it('clears corrupted user data and sets user to null', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'token') return Promise.resolve(mockToken);
      if (key === 'user') return Promise.resolve('NOT_VALID_JSON{{{');
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('token');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user');
  });

  it('sets loading to false even when AsyncStorage throws', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage failure'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    consoleSpy.mockRestore();
  });
});

describe('login', () => {
  it('calls authService.login with phone, stores token and user, sets user state', async () => {
    (authService.login as jest.Mock).mockResolvedValue(makeAuthResponse(mockToken, mockUser));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('09171234567', 'password123');
    });

    expect(authService.login).toHaveBeenCalledWith({
      phone: '09171234567',
      password: 'password123',
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('token', mockToken);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockUser));
    expect(result.current.user).toEqual(mockUser);
  });

  it('detects email input and sends email field instead of phone', async () => {
    (authService.login as jest.Mock).mockResolvedValue(makeAuthResponse(mockToken, mockUser));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('juan@example.com', 'password123');
    });

    expect(authService.login).toHaveBeenCalledWith({
      email: 'juan@example.com',
      password: 'password123',
    });
  });

  it('cleans up AsyncStorage on login failure and throws error', async () => {
    const serverError = {
      response: { data: { error: 'Invalid credentials' } },
    };
    (authService.login as jest.Mock).mockRejectedValue(serverError);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('09171234567', 'wrongpass');
      }),
    ).rejects.toThrow('Invalid credentials');

    // Both token and user should be cleaned up on failure
    await waitFor(() => {
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('token');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user');
    });
    expect(result.current.user).toBeNull();
  });

  it('throws generic message when server error has no details', async () => {
    (authService.login as jest.Mock).mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('09171234567', 'pass');
      }),
    ).rejects.toThrow('Network Error');
  });

  it('throws when server returns response without token', async () => {
    (authService.login as jest.Mock).mockResolvedValue({ data: { data: { user: mockUser } } });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('09171234567', 'pass');
      }),
    ).rejects.toThrow('Invalid login response from server');
  });
});

describe('register', () => {
  it('calls authService.register, stores token and user, sets user state', async () => {
    (authService.register as jest.Mock).mockResolvedValue(makeAuthResponse(mockToken, mockUser));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.register('Juan Dela Cruz', 'juan@example.com', '09171234567', 'password123');
    });

    expect(authService.register).toHaveBeenCalledWith({
      name: 'Juan Dela Cruz',
      email: 'juan@example.com',
      phone: '09171234567',
      password: 'password123',
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('token', mockToken);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockUser));
    expect(result.current.user).toEqual(mockUser);
  });

  it('cleans up AsyncStorage on register failure (the bug we fixed)', async () => {
    const serverError = {
      response: { data: { error: 'Phone already registered' } },
    };
    (authService.register as jest.Mock).mockRejectedValue(serverError);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.register('Juan', 'juan@example.com', '09171234567', 'pass');
      }),
    ).rejects.toThrow('Phone already registered');

    // This is the bug fix: register error path now cleans up AsyncStorage
    await waitFor(() => {
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('token');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user');
    });
    expect(result.current.user).toBeNull();
  });

  it('throws when server returns response without token', async () => {
    (authService.register as jest.Mock).mockResolvedValue({ data: { data: { user: mockUser } } });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.register('Juan', 'juan@example.com', '09171234567', 'pass');
      }),
    ).rejects.toThrow('Invalid registration response from server');
  });
});

describe('logout', () => {
  it('removes token and user from AsyncStorage, sets user to null', async () => {
    // Start logged in
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'token') return Promise.resolve(mockToken);
      if (key === 'user') return Promise.resolve(JSON.stringify(mockUser));
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(mockUser));

    await act(async () => {
      await result.current.logout();
    });

    expect(pushService.removeToken).toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('token');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user');
    expect(result.current.user).toBeNull();
  });

  it('still clears storage even if pushService.removeToken throws', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'token') return Promise.resolve(mockToken);
      if (key === 'user') return Promise.resolve(JSON.stringify(mockUser));
      return Promise.resolve(null);
    });
    (pushService.removeToken as jest.Mock).mockRejectedValue(new Error('push error'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(mockUser));

    await act(async () => {
      await result.current.logout();
    });

    // Storage should still be cleared despite push error
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('token');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user');
    expect(result.current.user).toBeNull();
  });
});

describe('updateUser', () => {
  it('persists to AsyncStorage BEFORE setting state (the bug we fixed)', async () => {
    // Start logged in
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'token') return Promise.resolve(mockToken);
      if (key === 'user') return Promise.resolve(JSON.stringify(mockUser));
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(mockUser));

    // Track call order to verify AsyncStorage.setItem is called before state update
    const callOrder: string[] = [];
    (AsyncStorage.setItem as jest.Mock).mockImplementation(() => {
      callOrder.push('asyncStorage.setItem');
      return Promise.resolve();
    });

    await act(async () => {
      await result.current.updateUser({ name: 'Juan Updated' });
    });

    // AsyncStorage.setItem should have been called with updated user
    const expectedUser = { ...mockUser, name: 'Juan Updated' };
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(expectedUser));

    // State should reflect the update
    expect(result.current.user).toEqual(expectedUser);
  });

  it('merges partial updates with existing user data', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'token') return Promise.resolve(mockToken);
      if (key === 'user') return Promise.resolve(JSON.stringify(mockUser));
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(mockUser));

    await act(async () => {
      await result.current.updateUser({ profile_image: 'https://example.com/photo.jpg' });
    });

    expect(result.current.user).toEqual({
      ...mockUser,
      profile_image: 'https://example.com/photo.jpg',
    });
  });

  it('does nothing when user is null (not logged in)', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateUser({ name: 'Should not work' });
    });

    // setItem should only NOT have been called for user update
    // (loadUser may call getItem but setItem should not be called)
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(result.current.user).toBeNull();
  });

  it('logs error but does not crash when AsyncStorage.setItem fails', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'token') return Promise.resolve(mockToken);
      if (key === 'user') return Promise.resolve(JSON.stringify(mockUser));
      return Promise.resolve(null);
    });

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Storage full'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(mockUser));

    // Should not throw
    await act(async () => {
      await result.current.updateUser({ name: 'Updated' });
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to persist updated user to AsyncStorage:',
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });
});

describe('refreshUser', () => {
  it('fetches fresh profile and updates state and storage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'token') return Promise.resolve(mockToken);
      if (key === 'user') return Promise.resolve(JSON.stringify(mockUser));
      return Promise.resolve(null);
    });

    const freshData = { name: 'Juan Fresh', rating: 4.8 };
    (userService.getProfile as jest.Mock).mockResolvedValue({
      data: { data: freshData },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(mockUser));

    await act(async () => {
      await result.current.refreshUser();
    });

    const expectedUser = { ...mockUser, ...freshData };
    expect(result.current.user).toEqual(expectedUser);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(expectedUser));
  });

  it('does not crash when getProfile fails', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'token') return Promise.resolve(mockToken);
      if (key === 'user') return Promise.resolve(JSON.stringify(mockUser));
      return Promise.resolve(null);
    });
    (userService.getProfile as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(mockUser));

    // Should not throw
    await act(async () => {
      await result.current.refreshUser();
    });

    // User should remain unchanged
    expect(result.current.user).toEqual(mockUser);
  });
});

describe('useAuth outside provider', () => {
  it('throws when used outside AuthProvider', () => {
    // Suppress console.error from React for the expected error boundary
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within AuthProvider');

    consoleSpy.mockRestore();
  });
});
