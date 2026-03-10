import axios from 'axios';

// Use environment variable for API URL, fallback to production
const API_URL = import.meta.env.VITE_API_URL || 'https://omji-backend.onrender.com/api/v1';

const API = axios.create({
  baseURL: API_URL,
  timeout: 120000,
  headers: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login: (data: { email: string; password: string }) => API.post('/public/auth/login', data),
};

export const adminService = {
  // Users
  getUsers: () => API.get('/admin/users'),
  getUserById: (id: number) => API.get(`/admin/users/${id}`),
  deleteUser: (id: number) => API.delete(`/admin/users/${id}`),
  updateUser: (id: number, data: any) => API.put(`/admin/users/${id}`, data),

  // Drivers
  getDrivers: () => API.get('/admin/drivers'),
  verifyDriver: (id: number) => API.post(`/admin/drivers/${id}/verify`),
  deleteDriver: (id: number) => API.delete(`/admin/drivers/${id}`),
  updateDriver: (id: number, data: any) => API.put(`/admin/drivers/${id}`, data),

  // Stores
  getStores: () => API.get('/admin/stores'),
  createStore: (data: any) => API.post('/admin/stores', data),
  updateStore: (id: number, data: any) => API.put(`/admin/stores/${id}`, data),
  deleteStore: (id: number) => API.delete(`/admin/stores/${id}`),

  // Store Menu Items
  getMenuItems: (storeId: number) => API.get(`/admin/stores/${storeId}/menu`),
  createMenuItem: (storeId: number, data: any) => API.post(`/admin/stores/${storeId}/menu`, data),
  updateMenuItem: (storeId: number, itemId: number, data: any) => API.put(`/admin/stores/${storeId}/menu/${itemId}`, data),
  deleteMenuItem: (storeId: number, itemId: number) => API.delete(`/admin/stores/${storeId}/menu/${itemId}`),

  // Analytics
  getRidesAnalytics: () => API.get('/admin/analytics/rides'),
  getDeliveriesAnalytics: () => API.get('/admin/analytics/deliveries'),
  getOrdersAnalytics: () => API.get('/admin/analytics/orders'),
  getEarningsAnalytics: () => API.get('/admin/analytics/earnings'),
  getMonthlyRevenue: () => API.get('/admin/analytics/monthly-revenue'),
  getGrowthAnalytics: () => API.get('/admin/analytics/growth'),

  // Promos
  getPromos: () => API.get('/admin/promos'),
  createPromo: (data: any) => API.post('/admin/promos', data),
  updatePromo: (id: number, data: any) => API.put(`/admin/promos/${id}`, data),
  deletePromo: (id: number) => API.delete(`/admin/promos/${id}`),

  // Rides
  getRides: () => API.get('/admin/rides'),
  updateRideStatus: (id: number, status: string) => API.put(`/admin/rides/${id}/status`, { status }),

  // Deliveries
  getDeliveries: () => API.get('/admin/deliveries'),
  updateDeliveryStatus: (id: number, status: string) => API.put(`/admin/deliveries/${id}/status`, { status }),

  // Orders
  getOrders: () => API.get('/admin/orders'),
  updateOrderStatus: (id: number, status: string) => API.put(`/admin/orders/${id}/status`, { status }),

  // Activity Logs
  getActivityLogs: () => API.get('/admin/activity-logs'),

  // Notifications
  getNotifications: () => API.get('/admin/notifications'),
  sendNotification: (data: { title: string; message: string; type?: string; target_type: string }) =>
    API.post('/admin/notifications', data),

  // Rates
  getRates: () => API.get('/admin/rates'),
  createRate: (data: any) => API.post('/admin/rates', data),
  updateRate: (id: number, data: any) => API.put(`/admin/rates/${id}`, data),
  deleteRate: (id: number) => API.delete(`/admin/rates/${id}`),
};

export default API;
