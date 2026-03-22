import { API_BASE_URL } from '../config/api.config';

export function getWebSocketUrl(path: string, token?: string): string {
  const wsUrl = API_BASE_URL
    .replace('https://', 'wss://')
    .replace('http://', 'ws://')
    .replace('/api/v1', '');
  const url = `${wsUrl}${path}`;
  return token ? `${url}?token=${token}` : url;
}
