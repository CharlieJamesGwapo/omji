// ── Shared Types for OMJI Admin ──────────────────────────────────────

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  profile_image: string;
  is_verified: boolean;
  role: string;
  rating: number;
  total_ratings: number;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: number;
  user_id: number;
  vehicle_type: string;
  vehicle_plate: string;
  vehicle_model: string;
  license_number: string;
  profile_photo: string;
  license_photo: string;
  orcr_photo: string;
  id_photo: string;
  is_verified: boolean;
  is_available: boolean;
  latitude: number;
  longitude: number;
  rating: number;
  total_ratings: number;
  total_rides: number;
  total_deliveries: number;
  created_at: string;
  updated_at: string;
  User?: User;
}

export interface Ride {
  id: number;
  user_id: number;
  driver_id: number | null;
  pickup_location: string;
  pickup_latitude: number;
  pickup_longitude: number;
  dropoff_location: string;
  dropoff_latitude: number;
  dropoff_longitude: number;
  distance: number;
  estimated_fare: number;
  final_fare: number;
  status: string;
  vehicle_type: string;
  payment_method: string;
  user_rating: number | null;
  driver_rating: number | null;
  user_review: string | null;
  driver_review: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  User: { name: string; email: string; phone: string };
  Driver: { User: { name: string }; vehicle_type: string; vehicle_plate: string } | null;
}

export interface Delivery {
  id: number;
  user_id: number;
  driver_id: number | null;
  pickup_location: string;
  dropoff_location: string;
  item_description: string;
  item_photo: string;
  notes: string;
  weight: number;
  distance: number;
  delivery_fee: number;
  tip: number;
  status: string;
  payment_method: string;
  barcode_number: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  User: { name: string; email: string; phone: string };
  Driver: { User: { name: string }; vehicle_type: string; vehicle_plate: string } | null;
}

export interface Order {
  id: number;
  user_id: number;
  store_id: number;
  items: string | OrderItem[];
  subtotal: number;
  delivery_fee: number;
  tax: number;
  total_amount: number;
  status: string;
  delivery_location: string;
  payment_method: string;
  user_rating: number | null;
  store_rating: number | null;
  created_at: string;
  User: { name: string; email: string; phone: string };
  Store: { name: string; category: string; address: string };
}

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Store {
  id: number;
  name: string;
  description: string;
  address: string;
  category: string;
  logo: string;
  opening_hours: string;
  is_open: boolean;
  is_verified: boolean;
  rating: number;
  total_ratings: number;
  latitude: number;
  longitude: number;
  phone: string;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: number;
  store_id: number;
  name: string;
  price: number;
  image?: string;
  category: string;
  available: boolean;
  created_at: string;
  updated_at: string;
}

export interface Promo {
  id: number;
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  minimum_amount: number;
  max_discount: number;
  usage_limit: number;
  usage_count: number;
  is_active: boolean;
  applicable_to: string;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface RateConfig {
  id: number;
  service_type: string;
  vehicle_type: string;
  base_fare: number;
  rate_per_km: number;
  minimum_fare: number;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentConfig {
  id: number;
  type: string;
  account_name: string;
  account_number: string;
  qr_code_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentProof {
  id: number;
  service_type: 'ride' | 'delivery' | 'order';
  service_id: number;
  user_id: number;
  user?: { id: number; name: string; email: string; phone: string };
  payment_method: 'gcash' | 'maya';
  reference_number: string;
  amount: number;
  proof_image_url: string;
  status: 'submitted' | 'verified' | 'rejected';
  verified_by_id?: number;
  verified_by_role?: 'rider' | 'admin';
  rejection_reason?: string;
  attempt_number: number;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  target_type: string;
  created_at: string;
  User?: { name: string; email: string };
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  type: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  type: string;
  action: string;
  description: string;
  details: string;
  status: string;
  user_name: string;
  user_email: string;
  amount: number;
  created_at: string;
}

export interface Referral {
  id: number;
  referrer_id: number;
  referred_id: number;
  referrer_bonus: number;
  referred_bonus: number;
  status: string;
  created_at: string;
  Referrer?: { id: number; name: string; phone: string };
  Referred?: { id: number; name: string; phone: string };
}

export interface WithdrawalRequest {
  id: number;
  driver_id: number;
  amount: number;
  method: string;
  account_number: string;
  account_name: string;
  status: string;
  note?: string;
  created_at: string;
  updated_at: string;
  Driver?: { id: number; user_id: number; User?: { name: string; phone: string } };
}
