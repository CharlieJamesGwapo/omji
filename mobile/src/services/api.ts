import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://omji-backend.onrender.com/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 45000,
  headers: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
});

// Retry requests once on network/timeout errors (GET always, POST only on timeout with no response)
api.interceptors.response.use(undefined, async (error) => {
  const config = error.config;
  if (config && !config.__retried && (!error.response || error.code === 'ECONNABORTED')) {
    const isGet = config.method === 'get';
    const isPostTimeout = config.method === 'post' && error.code === 'ECONNABORTED' && !error.response;
    if (isGet || isPostTimeout) {
      config.__retried = true;
      return api(config);
    }
  }
  return Promise.reject(error);
});

// Add token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses - clear expired/invalid tokens
let onUnauthorized: (() => void) | null = null;

export const setOnUnauthorized = (callback: () => void) => {
  onUnauthorized = callback;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token is expired or invalid - clear stored auth
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      if (onUnauthorized) {
        onUnauthorized();
      }
    }
    return Promise.reject(error);
  }
);

// Auth Services
export const authService = {
  register: (data: { name: string; email: string; phone: string; password: string }) =>
    api.post('/public/auth/register', data),

  login: (data: { phone?: string; email?: string; password: string }) =>
    api.post('/public/auth/login', data),

  verifyOTP: (data: { phone: string; otp: string }) =>
    api.post('/public/auth/verify-otp', data),

  resendOTP: (data: { phone: string }) =>
    api.post('/public/auth/resend-otp', data),

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
  getNearbyDrivers: (params: { latitude: number; longitude: number; vehicle_type?: string; max_distance?: number }) =>
    api.get('/rides/nearby-drivers', { params }),
  getActiveRides: () => api.get('/rides/active'),
  getRideDetails: (id: number) => api.get(`/rides/${id}`),
  cancelRide: (id: number) => api.put(`/rides/${id}/cancel`),
  rateRide: (id: number, rating: number, review: string) =>
    api.post(`/rides/${id}/rate`, { rating, review }),
  getRideHistory: () => api.get('/rides/history'),
};

// Ride Sharing Services
export const rideShareService = {
  createRideShare: (data: any) => api.post('/rideshare/create', data),
  getAvailableRideShares: () => api.get('/rideshare/available'),
  joinRideShare: (id: number, paymentMethod?: string) => api.post(`/rideshare/${id}/join`, { payment_method: paymentMethod || 'cash' }),
};

// Delivery Services
export const deliveryService = {
  createDelivery: (data: any) => api.post('/deliveries/create', data),
  createDeliveryWithPhoto: (data: any, photoUri: string | null) => {
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      formData.append(key, String(data[key]));
    });
    if (photoUri) {
      const filename = photoUri.split('/').pop() || 'photo.jpg';
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      formData.append('item_photo', {
        uri: photoUri,
        name: filename,
        type: mimeType,
      } as any);
    }
    return api.post('/deliveries/create', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
  },
  getActiveDeliveries: () => api.get('/deliveries/active'),
  getDeliveryDetails: (id: number) => api.get(`/deliveries/${id}`),
  cancelDelivery: (id: number) => api.put(`/deliveries/${id}/cancel`),
  rateDelivery: (id: number, rating: number) =>
    api.post(`/deliveries/${id}/rate`, { rating }),
  getDeliveryHistory: () => api.get('/deliveries/history'),
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
  getOrderHistory: () => api.get('/orders/history'),
};

// Wallet Services
export const walletService = {
  getBalance: () => api.get('/wallet/balance'),
  topUp: (data: { amount: number; payment_method: string }) =>
    api.post('/wallet/top-up', data),
  withdraw: (data: { amount: number; payment_method: string }) =>
    api.post('/wallet/withdraw', data),
};

// Favorites Services
export const favoritesService = {
  getFavorites: (type?: string) => api.get('/favorites', { params: type ? { type } : {} }),
  addFavorite: (data: { type: string; item_id: number }) => api.post('/favorites', data),
  deleteFavorite: (id: number) => api.delete(`/favorites/${id}`),
  checkFavorite: (type: string, itemId: number) => api.get('/favorites/check', { params: { type, item_id: itemId } }),
};

// Notification Services
export const notificationService = {
  getNotifications: () => api.get('/notifications'),
  markAsRead: (id: number) => api.put(`/notifications/${id}/read`),
};

// Payment Services
export const paymentService = {
  getPaymentMethods: () => api.get('/payments/methods'),
  addPaymentMethod: (data: any) => api.post('/payments/methods', data),
  deletePaymentMethod: (id: number) => api.delete(`/payments/methods/${id}`),
};

// Payment Config Services
export const paymentConfigService = {
  getConfigs: () => api.get('/payment-configs'),
};

// Rates Services
export const ratesService = {
  getRates: () => api.get('/rates'),
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
  registerDriverWithDocuments: (data: any, photos: { profile?: string | null; license?: string | null; orcr?: string | null; id?: string | null }) => {
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      formData.append(key, String(data[key]));
    });
    const photoFields: Array<{ key: keyof typeof photos; field: string }> = [
      { key: 'profile', field: 'profile_photo' },
      { key: 'license', field: 'license_photo' },
      { key: 'orcr', field: 'orcr_photo' },
      { key: 'id', field: 'id_photo' },
    ];
    photoFields.forEach(({ key, field }) => {
      const uri = photos[key];
      if (uri) {
        const filename = uri.split('/').pop() || 'photo.jpg';
        const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
        formData.append(field, { uri, name: filename, type: mimeType } as any);
      }
    });
    return api.post('/driver/register', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
  },
  getProfile: () => api.get('/driver/profile'),
  updateProfile: (data: any) => api.put('/driver/profile', data),
  getRequests: () => api.get('/driver/requests'),
  acceptRequest: (id: number) => api.post(`/driver/requests/${id}/accept`),
  rejectRequest: (id: number) => api.post(`/driver/requests/${id}/reject`),
  getEarnings: () => api.get('/driver/earnings'),
  setAvailability: (data: { available: boolean; latitude?: number; longitude?: number }) =>
    api.post('/driver/availability', data),
  updateRideStatus: (id: number, status: string) =>
    api.put(`/driver/rides/${id}/status`, { status }),
  updateDeliveryStatus: (id: number, status: string) =>
    api.put(`/driver/deliveries/${id}/status`, { status }),
};

// Chat Services
export const chatService = {
  getMessages: (id: number) => api.get(`/chats/${id}/messages`),
  sendMessage: (id: number, receiverId: number, message: string) =>
    api.post(`/chats/${id}/message`, { receiver_id: receiverId, message }),
};

export default api;
