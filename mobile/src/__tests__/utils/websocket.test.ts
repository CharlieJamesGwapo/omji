import { getWebSocketUrl } from '../../utils/websocket';

// The actual API_BASE_URL is 'https://omji-backend.onrender.com/api/v1'
// The function replaces https->wss, removes /api/v1, then appends path

describe('WebSocket Utilities', () => {
  describe('getWebSocketUrl', () => {
    it('constructs correct WebSocket URL with path', () => {
      const url = getWebSocketUrl('/ws/ride/123');
      expect(url).toBe('wss://omji-backend.onrender.com/ws/ride/123');
    });

    it('uses wss:// protocol for production https:// base URL', () => {
      const url = getWebSocketUrl('/ws/test');
      expect(url).toMatch(/^wss:\/\//);
    });

    it('strips /api/v1 from the base URL', () => {
      const url = getWebSocketUrl('/ws/chat');
      expect(url).not.toContain('/api/v1');
    });

    it('appends token as query parameter when provided', () => {
      const url = getWebSocketUrl('/ws/ride/456', 'my-auth-token');
      expect(url).toBe('wss://omji-backend.onrender.com/ws/ride/456?token=my-auth-token');
    });

    it('does not append token query param when token is undefined', () => {
      const url = getWebSocketUrl('/ws/ride/789');
      expect(url).not.toContain('?token=');
      expect(url).not.toContain('token=');
    });

    it('does not append token query param when token is empty string', () => {
      const url = getWebSocketUrl('/ws/ride/789', '');
      expect(url).not.toContain('?token=');
    });

    it('handles root path correctly', () => {
      const url = getWebSocketUrl('/');
      expect(url).toBe('wss://omji-backend.onrender.com/');
    });
  });
});
