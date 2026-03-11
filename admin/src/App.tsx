import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import DriversPage from './pages/DriversPage';
import StoresPage from './pages/StoresPage';
import PromosPage from './pages/PromosPage';
import RiderApprovalPage from './pages/RiderApprovalPage';
import NotificationsPage from './pages/NotificationsPage';
import ActivityLogsPage from './pages/ActivityLogsPage';
import RidesPage from './pages/RidesPage';
import DeliveriesPage from './pages/DeliveriesPage';
import OrdersPage from './pages/OrdersPage';
import RatesPage from './pages/RatesPage';
import PaymentConfigsPage from './pages/PaymentConfigsPage';
import { Toaster } from 'react-hot-toast';

const navGroups = [
  {
    label: 'Overview',
    items: [
      { path: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { path: '/activity-logs', label: 'Activity Logs', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    ],
  },
  {
    label: 'People',
    items: [
      { path: '/users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { path: '/drivers', label: 'Drivers', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
      { path: '/rider-approval', label: 'Rider Approval', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    ],
  },
  {
    label: 'Services',
    items: [
      { path: '/rides', label: 'Rides', icon: 'M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10' },
      { path: '/deliveries', label: 'Deliveries', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
      { path: '/orders', label: 'Orders', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z' },
      { path: '/stores', label: 'Stores', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { path: '/rates', label: 'Rates', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      { path: '/payment-configs', label: 'Payments', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
      { path: '/promos', label: 'Promos', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
      { path: '/notifications', label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
    ],
  },
];

const navItems = navGroups.flatMap(g => g.items);

const Sidebar: React.FC<{ onLogout: () => void; user: any; open: boolean; onClose: () => void }> = ({ onLogout, user, open, onClose }) => {
  const location = useLocation();

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />
      )}

      <div className={`
        fixed lg:sticky top-0 left-0 z-50 h-screen
        w-64 bg-white flex flex-col border-r border-gray-200
        transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
      `}>
        {/* Brand */}
        <div className="px-5 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="OMJI" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">OMJI</h1>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">Admin</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mx-4 border-t border-gray-100" />

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1 pt-4 first:pt-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{group.label}</p>
              {group.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                      isActive
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <svg className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                    </svg>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-2.5 px-2 mb-2">
            <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center text-gray-600 text-xs font-bold flex-shrink-0">
              {(user?.name || 'A')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user?.name || 'Admin'}</p>
              <p className="text-[11px] text-gray-400 truncate">{user?.email || 'Administrator'}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
};

const AdminLayout: React.FC<{ onLogout: () => void; user: any }> = ({ onLogout, user }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const currentPage = navItems.find(item => item.path === location.pathname);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar onLogout={onLogout} user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-7 h-7 bg-gray-900 rounded-md flex items-center justify-center overflow-hidden">
                <img src="/logo.png" alt="OMJI" className="w-full h-full object-cover" />
              </div>
              <span className="font-bold text-gray-900 text-sm">OMJI</span>
            </div>
            <div className="hidden lg:block">
              <h2 className="text-base font-semibold text-gray-900">{currentPage?.label || 'Dashboard'}</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Online
            </div>
          </div>
        </div>

        {/* Page */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 pb-20 sm:pb-6 lg:pb-8 overflow-auto">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/drivers" element={<DriversPage />} />
            <Route path="/rider-approval" element={<RiderApprovalPage />} />
            <Route path="/rides" element={<RidesPage />} />
            <Route path="/deliveries" element={<DeliveriesPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/activity-logs" element={<ActivityLogsPage />} />
            <Route path="/stores" element={<StoresPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/promos" element={<PromosPage />} />
            <Route path="/rates" element={<RatesPage />} />
            <Route path="/payment-configs" element={<PaymentConfigsPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    const userData = localStorage.getItem('adminUser');
    if (token && userData) {
      try {
        const parsed = JSON.parse(userData);
        if (parsed.role === 'admin') {
          setUser(parsed);
          setIsAuthenticated(true);
        }
      } catch {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
      }
    }
    setLoading(false);
  }, []);

  const handleLogin = (token: string, userData: any) => {
    localStorage.setItem('adminToken', token);
    localStorage.setItem('adminUser', JSON.stringify(userData));
    setUser(userData);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    setUser(null);
    setIsAuthenticated(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000, style: { borderRadius: '8px', padding: '12px 16px', fontSize: '13px' } }} />
      {isAuthenticated ? (
        <AdminLayout onLogout={handleLogout} user={user} />
      ) : (
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      )}
    </BrowserRouter>
  );
};

export default App;
