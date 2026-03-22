// ── Shared Utilities for OMJI Admin ──────────────────────────────────

import { STATUS_COLORS, DEFAULT_STATUS_COLOR } from '../constants';

/** Format a snake_case status to Title Case */
export const formatStatus = (status: string): string =>
  status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Get status badge classes */
export const getStatusColor = (status: string) =>
  STATUS_COLORS[status] || DEFAULT_STATUS_COLOR;

/** Format a date string to locale display */
export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/** Format a date string to locale display with time */
export const formatDateTime = (dateStr: string): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/** Format time only */
export const formatTime = (dateStr: string): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

/** Format currency in PHP */
export const formatCurrency = (amount: number): string =>
  `₱${(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Parse order items from JSON string or array */
export const parseItems = (items: string | any[]): any[] => {
  if (Array.isArray(items)) return items;
  try {
    const parsed = JSON.parse(items);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** Get driver documents as key-value pairs */
export const getDocuments = (driver: any): Record<string, string> => {
  const docs: Record<string, string> = {};
  if (driver.profile_photo) docs.profile_photo = driver.profile_photo;
  if (driver.license_photo) docs.license_photo = driver.license_photo;
  if (driver.orcr_photo) docs.orcr_photo = driver.orcr_photo;
  if (driver.id_photo) docs.id_photo = driver.id_photo;
  return docs;
};

/** Extract error message from API error */
export const getErrorMessage = (err: any, fallback: string): string =>
  err?.response?.data?.error || err?.response?.data?.message || fallback;
