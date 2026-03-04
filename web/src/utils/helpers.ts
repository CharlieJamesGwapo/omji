// Utility functions for calculations
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const calculateFare = (distance: number, vehicleType: string): number => {
  const baseFare = 50;
  const ratePerKm = vehicleType === 'car' ? 40 : 25;
  return baseFare + distance * ratePerKm;
};

export const formatCurrency = (amount: number): string => {
  return `₱${amount.toFixed(2)}`;
};

export const formatTime = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

export const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const formatDateTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^(\+\d{1,3}[- ]?)?\d{10,}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

export const truncateString = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
};

export const getRatingColor = (rating: number): string => {
  if (rating >= 4.5) return '#10B981'; // green
  if (rating >= 3.5) return '#F59E0B'; // orange
  return '#EF4444'; // red
};

export const getStatusBadgeClass = (status: string): string => {
  const statusClasses: { [key: string]: string } = {
    pending: 'badge-warning',
    confirmed: 'badge-info',
    accepted: 'badge-info',
    in_progress: 'badge-warning',
    completed: 'badge-success',
    cancelled: 'badge-danger',
  };
  return statusClasses[status] || 'badge-default';
};

export const getStatusDisplay = (status: string): string => {
  const displayNames: { [key: string]: string } = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    accepted: 'Accepted',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return displayNames[status] || status;
};
