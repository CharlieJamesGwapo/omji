import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Change this to your machine's local IP for physical device testing
// For physical device: use your computer's local IP
// For simulator: use localhost
const API_BASE_URL = 'http://192.168.0.28:8080/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Increased to 30 seconds
});

// Add token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth Services
export const authService = {
  register: (data: { name: string; email: string; phone: string; password: string }) =>
    api.post('/public/auth/register', data),

  login: (data: { phone?: string; email?: string; password: string }) =>
    api.post('/public/auth/login', data),

  verifyOTP: (data: { phone: string; otp: string }) =>
    api.post('/public/auth/verify-otp', data),

  registerRider: (data: any) => api.post('/driver/register', data),
};

// User Services
export const userService = {
  getProfile: () => api.get('/user/profile'),
  updateProfile: (data: any) => api.put('/user/profile', data),
  getSavedAddresses: () => api.get('/user/addresses'),
  addSavedAddress: (data: any) => api.post('/user/addresses', data),
  deleteSavedAddress: (id: number) => api.delete(`/user/addresses/${id}`),
};

// Ride Services
export const rideService = {
  createRide: (data: any) => api.post('/rides/create', data),
  getActiveRides: () => api.get('/rides/active'),
  getRideDetails: (id: number) => api.get(`/rides/${id}`),
  cancelRide: (id: number) => api.put(`/rides/${id}/cancel`),
  rateRide: (id: number, rating: number, review: string) =>
    api.post(`/rides/${id}/rate`, { rating, review }),
};

// Ride Sharing Services
export const rideShareService = {
  createRideShare: (data: any) => api.post('/rideshare/create', data),
  getAvailableRideShares: () => api.get('/rideshare/available'),
  joinRideShare: (id: number) => api.post(`/rideshare/${id}/join`),
};

// Delivery Services
export const deliveryService = {
  createDelivery: (data: any) => api.post('/deliveries/create', data),
  getActiveDeliveries: () => api.get('/deliveries/active'),
  getDeliveryDetails: (id: number) => api.get(`/deliveries/${id}`),
  cancelDelivery: (id: number) => api.put(`/deliveries/${id}/cancel`),
  rateDelivery: (id: number, rating: number) =>
    api.post(`/deliveries/${id}/rate`, { rating }),
};

// Store Services
export const storeService = {
  getStores: (category?: string) => api.get('/stores', { params: category ? { category } : {} }),
  getStoreMenu: (id: number) => api.get(`/stores/${id}/menu`),
};

// Order Services
export const orderService = {
  createOrder: (data: any) => api.post('/orders/create', data),
  getActiveOrders: () => api.get('/orders/active'),
  getOrderDetails: (id: number) => api.get(`/orders/${id}`),
  cancelOrder: (id: number) => api.put(`/orders/${id}/cancel`),
  rateOrder: (id: number, rating: number) =>
    api.post(`/orders/${id}/rate`, { rating }),
};

// Payment Services
export const paymentService = {
  getPaymentMethods: () => api.get('/payments/methods'),
  addPaymentMethod: (data: any) => api.post('/payments/methods', data),
  deletePaymentMethod: (id: number) => api.delete(`/payments/methods/${id}`),
};

// Promo Services
export const promoService = {
  getAvailablePromos: () => api.get('/promos/available'),
  applyPromo: (code: string, amount: number, type: string) =>
    api.post('/promos/apply', { code, amount, type }),
};

// Driver Services
export const driverService = {
  registerDriver: (data: any) => api.post('/driver/register', data),
  getProfile: () => api.get('/driver/profile'),
  updateProfile: (data: any) => api.put('/driver/profile', data),
  getRequests: () => api.get('/driver/requests'),
  acceptRequest: (id: number) => api.post(`/driver/requests/${id}/accept`),
  rejectRequest: (id: number) => api.post(`/driver/requests/${id}/reject`),
  getEarnings: () => api.get('/driver/earnings'),
  setAvailability: (data: { available: boolean; latitude?: number; longitude?: number }) =>
    api.post('/driver/availability', data),
};

// Chat Services
export const chatService = {
  getMessages: (id: number) => api.get(`/chats/${id}/messages`),
  sendMessage: (id: number, receiverId: number, message: string) =>
    api.post(`/chats/${id}/message`, { receiver_id: receiverId, message }),
};

export default api;
