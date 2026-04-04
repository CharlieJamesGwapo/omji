import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authService } from '../services/api';
import axios from 'axios';
import { getErrorMessage } from '../utils';

const API_URL = import.meta.env.VITE_API_URL || 'https://oneride-backend.onrender.com/api/v1';
const HEALTH_URL = API_URL.replace('/api/v1', '/health');

interface LoginPageProps {
  onLogin: (token: string, user: any) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'waking'>('checking');
  const [statusMessage, setStatusMessage] = useState('');
  const cancelledRef = useRef(false);
  const retryCountRef = useRef(0);

  // Continuous health check polling
  useEffect(() => {
    cancelledRef.current = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const checkHealth = async () => {
      if (cancelledRef.current) return;
      try {
        await axios.get(HEALTH_URL, { timeout: 10000 });
        if (!cancelledRef.current) {
          setServerStatus('online');
          setStatusMessage('');
        }
      } catch {
        if (!cancelledRef.current) {
          setServerStatus(prev => {
            if (prev === 'checking') return 'waking';
            return prev;
          });
          timeoutId = setTimeout(checkHealth, 5000);
        }
      }
    };

    checkHealth();
    return () => {
      cancelledRef.current = true;
      clearTimeout(timeoutId);
    };
  }, []);

  const attemptLogin = useCallback(async (retryOnFail = true): Promise<boolean> => {
    try {
      const loginData: any = { password };
      if (username.includes('@')) {
        loginData.email = username;
      } else {
        // Send both - backend accepts either
        loginData.email = username;
        loginData.phone = username;
      }

      const response = await authService.login(loginData);
      const data = response.data?.data;
      if (!data || !data.token || !data.user) {
        setError('Unexpected server response. Please try again.');
        return false;
      }
      const { token, user } = data;
      if (user.role !== 'admin') {
        setError('Admin access required. Please login with an admin account.');
        return false;
      }
      setServerStatus('online');
      onLogin(token, user);
      return true;
    } catch (err: any) {
      if (err.code === 'ECONNABORTED' || !err.response) {
        // Server timeout / not responding
        if (retryOnFail && retryCountRef.current < 3) {
          retryCountRef.current++;
          setStatusMessage(`Server is starting up... Retrying (${retryCountRef.current}/3)`);
          setServerStatus('waking');
          // Wait for health check, then retry
          try {
            await axios.get(HEALTH_URL, { timeout: 60000 });
            setServerStatus('online');
            setStatusMessage('Server is online! Signing in...');
            return await attemptLogin(false);
          } catch {
            setError('Server is taking too long to start. Please try again in a moment.');
            return false;
          }
        } else {
          setError('Could not reach the server. Please try again.');
          return false;
        }
      } else {
        setError(getErrorMessage(err, 'Login failed. Please check your credentials.'));
        return false;
      }
    }
  }, [username, password, onLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setStatusMessage('Connecting...');
    retryCountRef.current = 0;

    await attemptLogin(true);

    setLoading(false);
    setStatusMessage('');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-red-600 rounded-xl mx-auto mb-3 flex items-center justify-center overflow-hidden">
            <img src="/logo.png" alt="ONE RIDE" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ONE RIDE Admin</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Server Status */}
        {serverStatus === 'checking' && (
          <div className="mb-4 px-3 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2 bg-gray-100 text-gray-600">
            <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Connecting to server...
          </div>
        )}
        {serverStatus === 'waking' && !loading && (
          <div className="mb-4 px-3 py-2.5 rounded-lg text-xs font-medium bg-yellow-50 text-yellow-700">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Server is starting up...
            </div>
            <p className="mt-1 ml-6 text-[11px] text-yellow-600">Please wait a moment. It will auto-retry until the server is ready.</p>
          </div>
        )}
        {serverStatus === 'online' && !loading && (
          <div className="mb-4 px-3 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2 bg-green-50 text-green-700">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0"></div>
            Server is online
          </div>
        )}

        {/* Form */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          {error && (
            <div className="bg-red-50 text-red-700 px-3 py-2.5 rounded-lg mb-4 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Email or Phone</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none text-sm text-gray-900 placeholder-gray-400"
                placeholder="admin"
                required
                disabled={loading}
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none text-sm text-gray-900 placeholder-gray-400"
                placeholder="--------"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {statusMessage || 'Signing in...'}
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="text-center text-[11px] text-gray-400 mt-4">
            Admin access only
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
