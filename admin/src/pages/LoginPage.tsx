import React, { useState, useEffect } from 'react';
import { authService } from '../services/api';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://omji-backend.onrender.com/api/v1';
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

  useEffect(() => {
    let cancelled = false;
    const wakeServer = async () => {
      try {
        await axios.get(HEALTH_URL, { timeout: 5000 });
        if (!cancelled) setServerStatus('online');
      } catch {
        if (!cancelled) setServerStatus('waking');
        try {
          await axios.get(HEALTH_URL, { timeout: 120000 });
          if (!cancelled) setServerStatus('online');
        } catch {
          if (!cancelled) setServerStatus('waking');
        }
      }
    };
    wakeServer();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Send as both email and phone to support username "admin"
      const loginData: any = { password };
      if (username.includes('@')) {
        loginData.email = username;
      } else {
        // If no @, send as both email and phone for admin username
        loginData.email = username;
        loginData.phone = username;
      }

      const response = await authService.login(loginData);
      const { token, user } = response.data.data;
      if (user.role !== 'admin') {
        setError('Admin access required. Please login with an admin account.');
        setLoading(false);
        return;
      }
      onLogin(token, user);
    } catch (err: any) {
      if (err.code === 'ECONNABORTED' || !err.response) {
        setError('Server is starting up. Please wait a moment and try again.');
        setServerStatus('waking');
        // Retry waking the server
        axios.get(HEALTH_URL, { timeout: 120000 }).then(() => setServerStatus('online')).catch(() => {});
      } else {
        setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-red-50 rounded-full mx-auto mb-3 sm:mb-4 flex items-center justify-center border-4 border-red-600 shadow-lg shadow-red-600/30 overflow-hidden">
            <img src="/logo.png" alt="OMJI Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-red-600 mb-1 tracking-wide">OMJI</h1>
          <p className="text-gray-600 text-xs sm:text-sm font-medium">Admin Dashboard</p>
        </div>

        {/* Server Status */}
        {serverStatus !== 'online' && (
          <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-3 ${
            serverStatus === 'checking' ? 'bg-blue-50 text-blue-700' : 'bg-yellow-50 text-yellow-700'
          }`}>
            <svg className="w-5 h-5 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {serverStatus === 'checking' ? 'Connecting to server...' : 'Server is waking up, please wait...'}
          </div>
        )}
        {serverStatus === 'online' && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-3 bg-green-50 text-green-700">
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full flex-shrink-0"></div>
            Server is online
          </div>
        )}

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 border border-gray-100">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 text-center">Welcome Back!</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none transition-all text-gray-900"
                  placeholder="Username or Email"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none transition-all text-gray-900"
                  placeholder="Password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg shadow-red-600/30 hover:shadow-xl hover:shadow-red-600/40"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Login'
              )}
            </button>
          </form>

          <p className="text-center text-xs text-gray-500 mt-6 bg-gray-50 py-3 rounded-lg">
            Admin access required • Contact support for assistance
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
