import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

export function initSentry() {
  if (__DEV__ || !SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000,
    attachStacktrace: true,
    environment: __DEV__ ? 'development' : 'production',
  });
}

export function setUser(user: { id: number; email: string; name: string } | null) {
  if (__DEV__) return;
  if (user) {
    Sentry.setUser({ id: String(user.id), email: user.email, username: user.name });
  } else {
    Sentry.setUser(null);
  }
}

export function captureError(error: Error, context?: Record<string, any>) {
  if (__DEV__) {
    console.error('[Sentry]', error, context);
    return;
  }
  if (context) {
    Sentry.setContext('extra', context);
  }
  Sentry.captureException(error);
}

export function addBreadcrumb(message: string, category?: string, data?: Record<string, any>) {
  Sentry.addBreadcrumb({ message, category, data, level: 'info' });
}
