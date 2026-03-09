// OMJI App Theme Constants
// Centralized design system for consistent, professional UI

export const COLORS = {
  // Primary Brand
  primary: '#EF4444',        // OMJI Red
  primaryDark: '#DC2626',
  primaryLight: '#FCA5A5',
  primaryBg: '#FEF2F2',

  // Secondary / Accent
  accent: '#3B82F6',         // Blue
  accentDark: '#2563EB',
  accentLight: '#93C5FD',
  accentBg: '#EFF6FF',

  // Success
  success: '#10B981',
  successDark: '#059669',
  successLight: '#6EE7B7',
  successBg: '#ECFDF5',

  // Warning
  warning: '#F59E0B',
  warningDark: '#D97706',
  warningLight: '#FCD34D',
  warningBg: '#FFFBEB',

  // Error / Danger
  error: '#EF4444',
  errorDark: '#DC2626',
  errorLight: '#FCA5A5',
  errorBg: '#FEF2F2',

  // Info
  info: '#6366F1',
  infoDark: '#4F46E5',
  infoLight: '#A5B4FC',
  infoBg: '#EEF2FF',

  // Neutrals
  black: '#000000',
  gray900: '#111827',
  gray800: '#1F2937',
  gray700: '#374151',
  gray600: '#4B5563',
  gray500: '#6B7280',
  gray400: '#9CA3AF',
  gray300: '#D1D5DB',
  gray200: '#E5E7EB',
  gray100: '#F3F4F6',
  gray50: '#F9FAFB',
  white: '#FFFFFF',

  // Service Colors (Bisaya services)
  pasundo: '#3B82F6',        // Blue - Pick-up
  pasundoBg: '#EFF6FF',
  pasugo: '#10B981',         // Green - Delivery
  pasugoBg: '#ECFDF5',
  pasabay: '#8B5CF6',        // Purple - Ride Share
  pasabayBg: '#F5F3FF',
  store: '#F59E0B',          // Amber - Store Orders
  storeBg: '#FFFBEB',

  // Status Colors
  statusPending: '#F59E0B',
  statusActive: '#3B82F6',
  statusCompleted: '#10B981',
  statusCancelled: '#EF4444',
  statusInProgress: '#6366F1',

  // Background
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',

  // Gradient pairs
  gradientPrimary: ['#EF4444', '#DC2626'] as const,
  gradientAccent: ['#3B82F6', '#2563EB'] as const,
  gradientSuccess: ['#10B981', '#059669'] as const,
  gradientPurple: ['#8B5CF6', '#7C3AED'] as const,
  gradientDark: ['#1F2937', '#111827'] as const,
  gradientGold: ['#F59E0B', '#D97706'] as const,
};

export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  colored: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  }),
};

export const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  // Ride statuses
  pending: { color: '#F59E0B', bg: '#FFFBEB', icon: 'time-outline', label: 'Pending' },
  accepted: { color: '#3B82F6', bg: '#EFF6FF', icon: 'checkmark-circle-outline', label: 'Accepted' },
  driver_arrived: { color: '#8B5CF6', bg: '#F5F3FF', icon: 'location', label: 'Driver Arrived' },
  in_progress: { color: '#6366F1', bg: '#EEF2FF', icon: 'navigate', label: 'In Progress' },
  picked_up: { color: '#6366F1', bg: '#EEF2FF', icon: 'cube', label: 'Picked Up' },
  completed: { color: '#10B981', bg: '#ECFDF5', icon: 'checkmark-done-circle', label: 'Completed' },
  cancelled: { color: '#EF4444', bg: '#FEF2F2', icon: 'close-circle', label: 'Cancelled' },
  // Order statuses
  confirmed: { color: '#3B82F6', bg: '#EFF6FF', icon: 'checkmark-circle', label: 'Confirmed' },
  preparing: { color: '#F59E0B', bg: '#FFFBEB', icon: 'restaurant', label: 'Preparing' },
  ready: { color: '#8B5CF6', bg: '#F5F3FF', icon: 'bag-check', label: 'Ready' },
  out_for_delivery: { color: '#6366F1', bg: '#EEF2FF', icon: 'bicycle', label: 'Out for Delivery' },
  delivered: { color: '#10B981', bg: '#ECFDF5', icon: 'checkmark-done-circle', label: 'Delivered' },
};

export const formatStatus = (status: string): string => {
  return (STATUS_CONFIG[status]?.label) || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

export const getStatusColor = (status: string): string => {
  return STATUS_CONFIG[status]?.color || COLORS.gray500;
};

export const getStatusBg = (status: string): string => {
  return STATUS_CONFIG[status]?.bg || COLORS.gray100;
};
