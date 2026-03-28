/**
 * Lightweight error tracking stub.
 * Logs errors to console in dev, silently records in production.
 * Replace with a JS-only Sentry SDK or other service when ready.
 */

export function initSentry() {
  // No-op: add Sentry JS SDK or other tracking service here
}

export function setUser(_user: { id: number; email: string; name: string } | null) {
  // No-op
}

export function captureError(error: Error, context?: Record<string, any>) {
  if (__DEV__) {
    console.error('[Error]', error, context);
  }
}

export function addBreadcrumb(message: string, category?: string, _data?: Record<string, any>) {
  if (__DEV__) {
    console.debug(`[${category || 'app'}] ${message}`);
  }
}
