import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService, userService, pushService, setOnUnauthorized } from '../services/api';
import { setUser as setSentryUser } from '../utils/sentry';

interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: 'user' | 'rider' | 'driver' | 'admin';
  profile_image?: string;
  is_verified?: boolean;
  rating?: number;
  total_ratings?: number;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (name: string, email: string, phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
    // Auto-logout on 401 (expired/invalid token)
    setOnUnauthorized(() => setUser(null));
  }, []);

  const loadUser = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const userData = await AsyncStorage.getItem('user');

      if (token && userData) {
        try {
          setUser(JSON.parse(userData));
        } catch {
          // Corrupted user data - clear storage and force re-login
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('user');
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (phoneOrEmail: string, password: string) => {
    try {
      // Detect if input is email or phone/username
      const isEmail = phoneOrEmail.includes('@');
      const loginData = isEmail
        ? { email: phoneOrEmail, password }
        : { phone: phoneOrEmail, password };

      const response = await authService.login(loginData);

      // Backend returns: { success: true, data: { token, user } }
      const data = response.data?.data;
      if (!data?.token || !data?.user) {
        throw new Error('Invalid login response from server');
      }
      const { token, user: userData } = data;

      await AsyncStorage.setItem('token', token);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setUser(userData);
      setSentryUser(userData);
    } catch (error: any) {
      await AsyncStorage.removeItem('token').catch(() => {});
      await AsyncStorage.removeItem('user').catch(() => {});
      const message = error?.response?.data?.error || error?.message || 'Login failed';
      throw new Error(message);
    }
  };

  const register = async (name: string, email: string, phone: string, password: string) => {
    try {
      const response = await authService.register({ name, email, phone, password });

      // Backend returns: { success: true, data: { token, user, otp } }
      const data = response.data?.data;
      if (!data?.token || !data?.user) {
        throw new Error('Invalid registration response from server');
      }
      const { token, user: userData } = data;

      await AsyncStorage.setItem('token', token);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setUser(userData);
      setSentryUser(userData);
    } catch (error: any) {
      await AsyncStorage.removeItem('token').catch(() => {});
      await AsyncStorage.removeItem('user').catch(() => {});
      const message = error.response?.data?.error || error.message || 'Registration failed';
      throw new Error(message);
    }
  };

  const logout = async () => {
    try {
      try { await pushService.removeToken(); } catch {}
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      setUser(null);
      setSentryUser(null);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const updateUser = async (userData: Partial<User>) => {
    // Use functional setState so the merge is atomic with current state.
    // If two updateUser calls run in quick succession (e.g. upload then
    // text-field save), the second one must merge on top of the FIRST's
    // result — not a stale closure of user from two renders ago.
    let merged: User | null = null;
    setUser((current) => {
      if (!current) return current;
      merged = { ...current, ...userData };
      return merged;
    });
    if (merged) {
      try {
        await AsyncStorage.setItem('user', JSON.stringify(merged));
      } catch (error) {
        console.error('Failed to persist updated user to AsyncStorage:', error);
      }
    }
  };

  const refreshUser = async () => {
    try {
      const res = await userService.getProfile();
      const freshData = res.data?.data;
      if (!freshData) return;
      let merged: User | null = null;
      setUser((current) => {
        if (!current) return current;
        merged = { ...current, ...freshData };
        return merged;
      });
      if (merged) {
        await AsyncStorage.setItem('user', JSON.stringify(merged));
      }
    } catch (error) {
      console.warn('Failed to refresh user profile:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
