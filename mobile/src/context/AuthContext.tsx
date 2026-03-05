import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService, setOnUnauthorized } from '../services/api';

interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: 'user' | 'rider' | 'driver' | 'admin';
  profile_image?: string;
  is_verified?: boolean;
  rating?: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (name: string, email: string, phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => void;
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
        setUser(JSON.parse(userData));
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

      console.log('🔐 Login attempt with:', loginData);

      const response = await authService.login(loginData);
      console.log('✅ Login response received:', response.data);

      // Backend returns: { success: true, data: { token, user } }
      const data = response.data?.data;
      if (!data?.token || !data?.user) {
        throw new Error('Invalid login response from server');
      }
      const { token, user: userData } = data;

      await AsyncStorage.setItem('token', token);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setUser(userData);
      console.log('✅ Login successful! User:', userData.name);
    } catch (error: any) {
      console.error('❌ Login error:', error.response?.data || error.message);
      const message = error.response?.data?.error || error.message || 'Login failed';
      throw new Error(message);
    }
  };

  const register = async (name: string, email: string, phone: string, password: string) => {
    try {
      console.log('🔐 Register attempt with:', { name, email, phone });
      const response = await authService.register({ name, email, phone, password });
      console.log('✅ Register response received:', response.data);

      // Backend returns: { success: true, data: { token, user, otp } }
      const data = response.data?.data;
      if (!data?.token || !data?.user) {
        throw new Error('Invalid registration response from server');
      }
      const { token, user: userData } = data;

      await AsyncStorage.setItem('token', token);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setUser(userData);
      console.log('✅ Registration successful! User:', userData.name);
    } catch (error: any) {
      console.error('❌ Registration error:', error);
      console.error('❌ Error response:', error.response?.data);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error code:', error.code);

      const message = error.response?.data?.error || error.message || 'Registration failed';
      throw new Error(message);
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      setUser(null);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      setUser(updatedUser);
      AsyncStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
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
