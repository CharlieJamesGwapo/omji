import axios from 'axios';

// Use environment variable for API URL, fallback to production
const API_URL = import.meta.env.VITE_API_URL || 'https://omji-backend.onrender.com/api/v1';

const API = axios.create({
  baseURL: API_URL,
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

  // Drivers
  getDrivers: () => API.get('/admin/drivers'),
  verifyDriver: (id: number) => API.post(`/admin/drivers/${id}/verify`),
  deleteDriver: (id: number) => API.delete(`/admin/drivers/${id}`),

  // Stores
  getStores: () => API.get('/admin/stores'),
  createStore: (data: any) => API.post('/admin/stores', data),
  updateStore: (id: number, data: any) => API.put(`/admin/stores/${id}`, data),
  deleteStore: (id: number) => API.delete(`/admin/stores/${id}`),

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
};

export default API;
