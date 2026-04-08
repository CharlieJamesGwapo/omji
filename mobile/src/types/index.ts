// ===== User & Auth =====
export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: 'user' | 'rider' | 'driver' | 'admin';
  is_verified: boolean;
  rating?: number;
  total_ratings?: number;
  profile_image?: string;
  created_at?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

// ===== Location =====
export interface LocationData {
  address: string;
  latitude: number;
  longitude: number;
}

// ===== Rides =====
export interface Ride {
  id: number;
  user_id: number;
  driver_id?: number;
  status: RideStatus;
  pickup_location: string;
  pickup_latitude: number;
  pickup_longitude: number;
  dropoff_location: string;
  dropoff_latitude: number;
  dropoff_longitude: number;
  distance?: number;
  distance_km?: number;
  estimated_fare: number;
  final_fare?: number;
  vehicle_type: string;
  payment_method: PaymentMethod;
  driver?: DriverInfo;
  created_at: string;
  completed_at?: string;
}

export type RideStatus =
  | 'pending'
  | 'accepted'
  | 'driver_arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

// ===== Deliveries =====
export interface Delivery {
  id: number;
  user_id: number;
  driver_id?: number;
  status: DeliveryStatus;
  pickup_location: string;
  pickup_latitude: number;
  pickup_longitude: number;
  dropoff_location: string;
  dropoff_latitude: number;
  dropoff_longitude: number;
  distance?: number;
  delivery_fee: number;
  item_description: string;
  item_photo?: string;
  notes?: string;
  weight?: number;
  payment_method: PaymentMethod;
  driver?: DriverInfo;
  created_at: string;
  completed_at?: string;
}

export type DeliveryStatus =
  | 'pending'
  | 'accepted'
  | 'driver_arrived'
  | 'picked_up'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

// ===== Orders =====
export interface Order {
  id: number;
  user_id: number;
  store_id: number;
  status: OrderStatus;
  items: any;
  subtotal: number;
  delivery_fee: number;
  tax: number;
  total_amount: number;
  delivery_location: string;
  delivery_address?: string;
  payment_method: PaymentMethod;
  Store?: { name: string };
  store_name?: string;
  created_at: string;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled';

// ===== Driver =====
export interface DriverInfo {
  id: number;
  user_id?: number;
  name: string;
  phone?: string;
  profile_image?: string;
  vehicle_type?: string;
  vehicle_model?: string;
  vehicle_plate?: string;
  rating?: number;
  current_latitude?: number;
  current_longitude?: number;
  latitude?: number;
  longitude?: number;
}

// ===== RideShare =====
export interface RideShare {
  id: number;
  driver_id: number;
  pickup_location: string;
  dropoff_location: string;
  total_seats: number;
  available_seats: number;
  base_fare: number;
  departure_time: string;
  status: string;
  driver?: DriverInfo & { vehicle_plate?: string };
  created_at: string;
}

// ===== Wallet =====
export interface Wallet {
  id: number;
  user_id: number;
  balance: number;
}

export interface WalletTransaction {
  id: number;
  wallet_id: number;
  type: 'top_up' | 'payment' | 'withdrawal';
  amount: number;
  description: string;
  reference?: string;
  created_at: string;
}

// ===== Notifications =====
export interface Notification {
  id: number;
  user_id: number;
  title: string;
  body: string;
  type: string;
  read: boolean;
  created_at: string;
}

// ===== Payment =====
export type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'wallet';

export type PaymentStatus = 'pending' | 'submitted' | 'verified' | 'rejected';

export interface PaymentProof {
  id: number;
  service_type: 'ride' | 'delivery' | 'order';
  service_id: number;
  user_id: number;
  payment_method: 'gcash' | 'maya';
  reference_number: string;
  amount: number;
  proof_image_url: string;
  status: PaymentStatus;
  verified_by_id?: number;
  verified_by_role?: 'rider' | 'admin';
  rejection_reason?: string;
  attempt_number: number;
  created_at: string;
  updated_at: string;
}

// ===== Stores =====
export interface Store {
  id: number;
  name: string;
  category: string;
  description?: string;
  address: string;
  logo?: string;
  cover_image?: string;
  rating: number;
  is_open: boolean;
  opening_hours?: string;
  latitude?: number;
  longitude?: number;
}

export interface MenuItem {
  id: number;
  store_id: number;
  name: string;
  description?: string;
  price: number;
  image?: string;
  category?: string;
  available: boolean;
}

// ===== Favorites =====
export interface Favorite {
  id: number;
  type: 'store' | 'driver';
  item_id: number;
  name?: string;
  category?: string;
  rating?: number;
  logo?: string;
  address?: string;
  created_at: string;
}

// ===== Saved Addresses =====
export interface SavedAddress {
  id: number;
  user_id: number;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
}

// ===== Chat =====
export interface ChatMessage {
  id: number;
  sender_id: number;
  receiver_id: number;
  ride_id?: number;
  message: string;
  created_at: string;
}

// ===== Navigation =====
export type RootStackParamList = {
  // Auth
  Login: undefined;
  Register: undefined;
  OTP: { phone: string };
  RiderRegistration: undefined;

  // Main
  MainTabs: undefined;
  Pasugo: undefined;
  Pasabay: undefined;
  Pasundo: undefined | { dropoff?: { address: string; latitude: number; longitude: number } };
  StoreDetail: { storeId: number; storeName?: string };
  Cart: { storeId: number; storeName: string; items: any[] };
  Tracking: {
    type: 'ride' | 'delivery';
    rideId: number;
    pickup: string;
    dropoff: string;
    fare: number;
  };
  Chat: {
    rider: DriverInfo;
    rideId?: number;
    deliveryId?: number;
  };
  Wallet: undefined;
  RideHistory: undefined;
  EditProfile: undefined;
  SavedAddresses: undefined;
  PaymentMethods: undefined;
  Favorites: undefined;
  Notifications: undefined;

  // Rider
  RiderDashboard: undefined;
  RiderEarnings: undefined;
  RiderProfile: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Services: undefined;
  Orders: undefined;
  Profile: undefined;
};
