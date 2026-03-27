// ── Shared Constants for OMJI Admin ──────────────────────────────────

export const ITEMS_PER_PAGE = 20;

// ── Status Badge Colors ─────────────────────────────────────────────
// Unified color mapping for all service statuses
export const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  // Common
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending' },
  accepted: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Accepted' },
  driver_arrived: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Driver Arrived' },
  in_progress: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'In Progress' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' },
  scheduled: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Scheduled' },
  approved: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Approved' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
  // Delivery-specific
  picked_up: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Picked Up' },
  // Order-specific
  confirmed: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Confirmed' },
  preparing: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Preparing' },
  ready: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Ready' },
  out_for_delivery: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Out for Delivery' },
  delivered: { bg: 'bg-green-100', text: 'text-green-700', label: 'Delivered' },
};

export const DEFAULT_STATUS_COLOR = { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Unknown' };

// ── Verified / Role Badges ──────────────────────────────────────────
export const VERIFIED_BADGE = 'bg-green-100 text-green-700';
export const UNVERIFIED_BADGE = 'bg-yellow-100 text-yellow-700';

export const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  driver: 'bg-blue-100 text-blue-700',
  user: 'bg-gray-100 text-gray-700',
};

// ── Document Labels ─────────────────────────────────────────────────
export const DOC_LABELS: Record<string, string> = {
  profile_photo: 'Profile Photo',
  license_photo: "Driver's License",
  orcr_photo: 'OR/CR',
  id_photo: 'Valid ID',
};

// ── Category Colors ─────────────────────────────────────────────────
export const STORE_CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  restaurant: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  grocery: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  pharmacy: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
};

export const MENU_CATEGORY_COLORS: Record<string, string> = {
  food: 'bg-orange-100 text-orange-700',
  drink: 'bg-blue-100 text-blue-700',
  dessert: 'bg-pink-100 text-pink-700',
  snack: 'bg-yellow-100 text-yellow-700',
  other: 'bg-gray-100 text-gray-700',
};

// ── Service Config ──────────────────────────────────────────────────
export const SERVICE_LABELS: Record<string, string> = {
  ride: 'Pasundo (Ride)',
  delivery: 'Pasugo (Delivery)',
  order: 'Order Delivery',
};

export const SERVICE_COLORS: Record<string, { bg: string; text: string; border: string; badge: string; light: string }> = {
  ride: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', light: 'bg-blue-500' },
  delivery: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', light: 'bg-purple-500' },
  order: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', light: 'bg-amber-500' },
};

export const VEHICLE_LABELS: Record<string, string> = {
  motorcycle: 'Motorcycle',
  car: 'Car',
};

// ── Ride Status Options ─────────────────────────────────────────────
export const RIDE_STATUS_OPTIONS = ['pending', 'accepted', 'driver_arrived', 'in_progress', 'completed', 'cancelled'];
export const DELIVERY_STATUS_OPTIONS = ['pending', 'accepted', 'driver_arrived', 'picked_up', 'in_progress', 'completed', 'cancelled'];
export const ORDER_STATUS_OPTIONS = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
