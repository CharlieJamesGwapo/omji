import axios from 'axios';
import { useAuthStore } from '../context/authStore';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Ride Services
export const rideService = {
  createRide: (data: any) => api.post('/rides/create', data),
  getActiveRides: () => api.get('/rides/active'),
  getRideDetails: (id: number) => api.get(`/rides/${id}`),
  cancelRide: (id: number) => api.put(`/rides/${id}/cancel`),
  rateRide: (id: number, rating: number, review: string) =>
    api.post(`/rides/${id}/rate`, { rating, review }),
};

// Delivery Services
export const deliveryService = {
  createDelivery: (data: any) => api.post('/deliveries/create', data),
  getActiveDeliveries: () => api.get('/deliveries/active'),
  getDeliveryDetails: (id: number) => api.get(`/deliveries/${id}`),
  cancelDelivery: (id: number) => api.put(`/deliveries/${id}/cancel`),
};

// Store Services
export const storeService = {
  getStores: () => api.get('/stores'),
  getStoreMenu: (id: number) => api.get(`/stores/${id}/menu`),
};

// Order Services
export const orderService = {
  createOrder: (data: any) => api.post('/orders/create', data),
  getActiveOrders: () => api.get('/orders/active'),
  getOrderDetails: (id: number) => api.get(`/orders/${id}`),
  cancelOrder: (id: number) => api.put(`/orders/${id}/cancel`),
};

// User Services
export const userService = {
  getProfile: () => api.get('/user/profile'),
  updateProfile: (data: any) => api.put('/user/profile', data),
};

// Driver Services
export const driverService = {
  registerDriver: (data: any) => api.post('/driver/register', data),
  getProfile: () => api.get('/driver/profile'),
  getRequests: () => api.get('/driver/requests'),
  acceptRequest: (id: number) => api.post(`/driver/requests/${id}/accept`),
  getEarnings: () => api.get('/driver/earnings'),
};

export default api;
