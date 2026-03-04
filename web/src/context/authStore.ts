import { create } from 'zustand';

interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  rating: number;
  profileImage?: string;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: localStorage.getItem('authToken'),
  isAuthenticated: !!localStorage.getItem('authToken'),

  login: async (email: string, password: string) => {
    try {
      // Call API
      const response = await fetch('/api/v1/public/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) throw new Error('Login failed');

      const data = await response.json();
      localStorage.setItem('authToken', data.token);
      set({ token: data.token, user: data.user, isAuthenticated: true });
    } catch (error) {
      console.error(error);
      throw error;
    }
  },

  register: async (name: string, email: string, password: string, phone: string) => {
    try {
      const response = await fetch('/api/v1/public/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, phone }),
      });

      if (!response.ok) throw new Error('Registration failed');

      const data = await response.json();
      localStorage.setItem('authToken', data.token);
      set({ token: data.token, user: data.user, isAuthenticated: true });
    } catch (error) {
      console.error(error);
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('authToken');
    set({ token: null, user: null, isAuthenticated: false });
  },

  setUser: (user: User) => {
    set({ user });
  },
}));
