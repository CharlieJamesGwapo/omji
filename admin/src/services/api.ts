import axios from 'axios';

// Use environment variable for API URL, fallback to production
const API_URL = import.meta.env.VITE_API_URL || 'https://omji-backend.onrender.com/api/v1';

// ── In-memory cache with stale-while-revalidate ──────────────────────
interface CacheEntry {
  data: any;
  timestamp: number;
  promise?: Promise<any>;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 20_000; // 20 seconds fresh
const STALE_TTL = 45_000; // 45 seconds before hard refetch

function invalidateCache(pattern?: string) {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
}

// ── Axios instance ───────────────────────────────────────────────────
const API = axios.create({
  baseURL: API_URL,
  timeout: 60000,
  headers: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
});

// Auth token injection
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 redirect + cache invalidation on mutations
API.interceptors.response.use(
  (response) => {
    // Invalidate related caches on mutations
    const method = response.config.method?.toLowerCase();
    if (method && ['post', 'put', 'delete', 'patch'].includes(method)) {
      const url = response.config.url || '';
      const parts = url.split('/').filter(Boolean);
      // Invalidate the collection endpoint for the mutated resource
      if (parts.length >= 2) {
        const resource = parts.slice(0, 3).join('/');
        invalidateCache(resource);
      }
      // Only invalidate analytics when the mutation affects data they aggregate
      const analyticsAffecting = ['/admin/rides', '/admin/deliveries', '/admin/orders', '/admin/stores'];
      if (analyticsAffecting.some(prefix => url.includes(prefix))) {
        invalidateCache('/admin/analytics');
      }
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Cached GET wrapper ───────────────────────────────────────────────
function cachedGet(url: string, config?: any) {
  const key = `get:${API_URL}${url}`;
  const entry = cache.get(key);
  const now = Date.now();

  if (entry) {
    const age = now - entry.timestamp;

    // Fresh cache - return immediately
    if (age < CACHE_TTL) {
      return Promise.resolve(entry.data);
    }

    // Stale but usable - return stale and revalidate in background
    if (age < STALE_TTL) {
      // Deduplicate revalidation requests
      if (!entry.promise) {
        entry.promise = API.get(url, config).then((res) => {
          cache.set(key, { data: res, timestamp: Date.now() });
          return res;
        }).catch(() => {
          // On error, keep stale data
          entry.promise = undefined;
          return entry.data;
        });
      }
      return Promise.resolve(entry.data);
    }
  }

  // No cache or expired - fetch fresh
  return API.get(url, config).then((res) => {
    cache.set(key, { data: res, timestamp: Date.now() });
    return res;
  });
}

// Force-refresh a cached endpoint (bypasses cache, updates it)
function freshGet(url: string, config?: any) {
  const key = `get:${API_URL}${url}`;
  return API.get(url, config).then((res) => {
    cache.set(key, { data: res, timestamp: Date.now() });
    return res;
  });
}

// ── Service exports ──────────────────────────────────────────────────
export const authService = {
  login: (data: { email: string; password: string }) => API.post('/public/auth/login', data),
};

export const adminService = {
  // Users
  getUsers: () => cachedGet('/admin/users'),
  getUserById: (id: number) => API.get(`/admin/users/${id}`),
  deleteUser: (id: number) => API.delete(`/admin/users/${id}`),
  updateUser: (id: number, data: any) => API.put(`/admin/users/${id}`, data),

  // Drivers
  getDrivers: () => cachedGet('/admin/drivers'),
  verifyDriver: (id: number) => API.post(`/admin/drivers/${id}/verify`),
  deleteDriver: (id: number) => API.delete(`/admin/drivers/${id}`),
  updateDriver: (id: number, data: any) => API.put(`/admin/drivers/${id}`, data),

  // Stores
  getStores: () => cachedGet('/admin/stores'),
  createStore: (data: any) => API.post('/admin/stores', data),
  updateStore: (id: number, data: any) => API.put(`/admin/stores/${id}`, data),
  deleteStore: (id: number) => API.delete(`/admin/stores/${id}`),

  // Store Menu Items
  getMenuItems: (storeId: number) => cachedGet(`/admin/stores/${storeId}/menu`),
  createMenuItem: (storeId: number, data: any) => API.post(`/admin/stores/${storeId}/menu`, data),
  updateMenuItem: (storeId: number, itemId: number, data: any) => API.put(`/admin/stores/${storeId}/menu/${itemId}`, data),
  deleteMenuItem: (storeId: number, itemId: number) => API.delete(`/admin/stores/${storeId}/menu/${itemId}`),

  // Analytics (cached)
  getRidesAnalytics: () => cachedGet('/admin/analytics/rides'),
  getDeliveriesAnalytics: () => cachedGet('/admin/analytics/deliveries'),
  getOrdersAnalytics: () => cachedGet('/admin/analytics/orders'),
  getEarningsAnalytics: () => cachedGet('/admin/analytics/earnings'),
  getMonthlyRevenue: () => cachedGet('/admin/analytics/monthly-revenue'),
  getGrowthAnalytics: () => cachedGet('/admin/analytics/growth'),
  getExtendedAnalytics: () => cachedGet('/admin/analytics/extended'),

  // Fresh versions for explicit refresh
  refreshUsers: () => freshGet('/admin/users'),
  refreshDrivers: () => freshGet('/admin/drivers'),
  refreshRides: () => freshGet('/admin/rides'),
  refreshDeliveries: () => freshGet('/admin/deliveries'),
  refreshOrders: () => freshGet('/admin/orders'),
  refreshDashboard: () => {
    // Actually fetch fresh data for all dashboard endpoints
    return Promise.all([
      freshGet('/admin/users'),
      freshGet('/admin/drivers'),
      freshGet('/admin/analytics/rides'),
      freshGet('/admin/analytics/earnings'),
      freshGet('/admin/analytics/monthly-revenue'),
      freshGet('/admin/analytics/extended'),
    ]);
  },

  // Promos
  getPromos: () => cachedGet('/admin/promos'),
  createPromo: (data: any) => API.post('/admin/promos', data),
  updatePromo: (id: number, data: any) => API.put(`/admin/promos/${id}`, data),
  deletePromo: (id: number) => API.delete(`/admin/promos/${id}`),

  // Rides
  getRides: () => cachedGet('/admin/rides'),
  updateRideStatus: (id: number, status: string) => API.put(`/admin/rides/${id}/status`, { status }),

  // Deliveries
  getDeliveries: () => cachedGet('/admin/deliveries'),
  updateDeliveryStatus: (id: number, status: string) => API.put(`/admin/deliveries/${id}/status`, { status }),

  // Orders
  getOrders: () => cachedGet('/admin/orders'),
  updateOrderStatus: (id: number, status: string) => API.put(`/admin/orders/${id}/status`, { status }),

  // Activity Logs
  getActivityLogs: () => cachedGet('/admin/activity-logs'),

  // Notifications
  getNotifications: () => cachedGet('/admin/notifications'),
  sendNotification: (data: { title: string; message: string; type?: string; target_type: string }) =>
    API.post('/admin/notifications', data),

  // Announcements
  getAnnouncements: () => cachedGet('/announcements'),
  createAnnouncement: (data: { title: string; message: string; type: string; expires_at?: string }) =>
    API.post('/admin/announcements', data),
  deleteAnnouncement: (id: number) => API.delete(`/admin/announcements/${id}`),

  // Rates
  getRates: () => cachedGet('/admin/rates'),
  createRate: (data: any) => API.post('/admin/rates', data),
  updateRate: (id: number, data: any) => API.put(`/admin/rates/${id}`, data),
  deleteRate: (id: number) => API.delete(`/admin/rates/${id}`),

  // Payment Configs
  getPaymentConfigs: () => cachedGet('/admin/payment-configs'),
  createPaymentConfig: (data: any) => API.post('/admin/payment-configs', data),
  updatePaymentConfig: (id: number, data: any) => API.put(`/admin/payment-configs/${id}`, data),
  deletePaymentConfig: (id: number) => API.delete(`/admin/payment-configs/${id}`),
  uploadQRCode: (file: File) => {
    const formData = new FormData();
    formData.append('qr_image', file);
    return API.post('/admin/payment-configs/upload-qr', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
  },

  // Withdrawals
  getWithdrawals: () => cachedGet('/admin/withdrawals'),
  updateWithdrawal: (id: number, data: { status: string; note?: string }) =>
    API.put(`/admin/withdrawals/${id}`, data),

  // Commission
  getCommissionConfig: () => cachedGet('/admin/commission/config'),
  updateCommissionConfig: (data: { percentage: number }) => API.put('/admin/commission/config', data),
  getCommissionRecords: (params?: {
    page?: number;
    limit?: number;
    service_type?: string;
    status?: string;
    payment_method?: string;
    date_from?: string;
    date_to?: string;
  }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== 'all') {
          query.set(key, String(value));
        }
      });
    }
    const qs = query.toString();
    return cachedGet(`/admin/commission/records${qs ? `?${qs}` : ''}`);
  },
  getCommissionSummary: () => cachedGet('/admin/commission/summary'),
};

// Utility to clear all cache (useful for manual refresh)
export const clearCache = () => invalidateCache();

// Health check
export const healthCheck = () => axios.get(`${API_URL.replace('/api/v1', '')}/health`, { timeout: 5000 });

export default API;
