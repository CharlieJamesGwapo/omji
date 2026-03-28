// Capture interceptor callbacks
let requestInterceptor: (config: any) => Promise<any>;
let responseSuccessInterceptor: (response: any) => any;
let responseErrorInterceptor: (error: any) => Promise<any>;

// Build mock instance inside the factory so it's available when jest.mock is hoisted
jest.mock('axios', () => {
  const inst: any = {
    interceptors: {
      request: {
        use: jest.fn((fn: any) => {
          requestInterceptor = fn;
        }),
      },
      response: {
        use: jest.fn((successFn: any, errorFn: any) => {
          responseSuccessInterceptor = successFn;
          responseErrorInterceptor = errorFn;
        }),
      },
    },
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  inst.create = jest.fn(() => inst);
  return { __esModule: true, default: inst };
});

// Static imports - api.ts will use the mocked axios
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setOnUnauthorized,
  deliveryService,
  driverService,
} from '../../services/api';

// Reference to the mock instance
const mockInstance = (axios as any).create();

// Capture create args before any beforeEach clears them
const createCallArgs = (axios as any).create.mock.calls[0];

describe('API Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('axios instance creation', () => {
    it('creates axios instance with correct baseURL and timeout', () => {
      expect(createCallArgs[0]).toMatchObject({
        baseURL: expect.any(String),
        timeout: 45000,
      });
    });

    it('sets cache-control headers to prevent caching', () => {
      expect(createCallArgs[0].headers).toMatchObject({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
    });
  });

  describe('request interceptor', () => {
    it('adds Authorization header when token exists in AsyncStorage', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('test-token-123');

      const config = { headers: {} } as any;
      const result = await requestInterceptor(config);

      expect(AsyncStorage.getItem).toHaveBeenCalledWith('token');
      expect(result.headers.Authorization).toBe('Bearer test-token-123');
    });

    it('does not add Authorization header when no token exists', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const config = { headers: {} } as any;
      const result = await requestInterceptor(config);

      expect(result.headers.Authorization).toBeUndefined();
    });

    it('proceeds without token when AsyncStorage throws', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('Storage error'));

      const config = { headers: {} } as any;
      const result = await requestInterceptor(config);

      expect(result.headers.Authorization).toBeUndefined();
    });
  });

  describe('response interceptor - 401 handling', () => {
    it('clears token and user from AsyncStorage on 401 response', async () => {
      const error = {
        config: { method: 'get', __retried: true },
        response: { status: 401 },
      };

      await expect(responseErrorInterceptor(error)).rejects.toBe(error);

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('token');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user');
    });

    it('calls onUnauthorized callback on 401 when set', async () => {
      const mockCallback = jest.fn();
      setOnUnauthorized(mockCallback);

      const error = {
        config: { method: 'get', __retried: true },
        response: { status: 401 },
      };

      await expect(responseErrorInterceptor(error)).rejects.toBe(error);

      expect(mockCallback).toHaveBeenCalled();
    });

    it('does not call onUnauthorized on non-401 errors', async () => {
      const mockCallback = jest.fn();
      setOnUnauthorized(mockCallback);

      const error = {
        config: { method: 'get', __retried: true },
        response: { status: 500 },
      };

      await expect(responseErrorInterceptor(error)).rejects.toBe(error);

      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('response interceptor - retry logic', () => {
    it('retries GET requests once on network error (no response)', async () => {
      const config: any = { method: 'get' };
      const error = { config, response: undefined, code: 'ERR_NETWORK' };

      try {
        await responseErrorInterceptor(error);
      } catch {
        // Expected - mock api instance is not callable as a function for retry
      }

      expect(config.__retried).toBe(true);
    });

    it('retries POST requests on timeout with no response (ECONNABORTED)', async () => {
      const config: any = { method: 'post' };
      const error = { config, response: undefined, code: 'ECONNABORTED' };

      try {
        await responseErrorInterceptor(error);
      } catch {
        // Expected
      }

      expect(config.__retried).toBe(true);
    });

    it('does NOT retry POST requests on non-timeout network errors', async () => {
      const config: any = { method: 'post' };
      const error = { config, response: undefined, code: 'ERR_NETWORK' };

      await expect(responseErrorInterceptor(error)).rejects.toBe(error);

      expect(config.__retried).toBeUndefined();
    });

    it('does NOT retry POST requests when response exists even with ECONNABORTED', async () => {
      const config: any = { method: 'post' };
      const error = { config, response: { status: 500 }, code: 'ECONNABORTED' };

      await expect(responseErrorInterceptor(error)).rejects.toBe(error);

      expect(config.__retried).toBeUndefined();
    });

    it('does NOT retry already-retried requests', async () => {
      const config: any = { method: 'get', __retried: true };
      const error = { config, response: undefined, code: 'ERR_NETWORK' };

      await expect(responseErrorInterceptor(error)).rejects.toBe(error);
    });

    it('passes through successful responses unchanged', () => {
      const response = { data: { message: 'ok' }, status: 200 };
      expect(responseSuccessInterceptor(response)).toBe(response);
    });
  });

  describe('createDeliveryWithPhoto - FormData creation', () => {
    it('converts object values to JSON.stringify and primitives to String()', () => {
      const appendSpy = jest.fn();
      const OrigFormData = global.FormData;
      global.FormData = jest.fn(() => ({ append: appendSpy })) as any;

      const data = {
        sender_name: 'John',
        amount: 150,
        pickup_location: { lat: 8.43, lng: 124.77 },
        is_fragile: true,
        notes: null,
      };

      deliveryService.createDeliveryWithPhoto(data, null);

      expect(appendSpy).toHaveBeenCalledWith('sender_name', 'John');
      expect(appendSpy).toHaveBeenCalledWith('amount', '150');
      expect(appendSpy).toHaveBeenCalledWith(
        'pickup_location',
        JSON.stringify({ lat: 8.43, lng: 124.77 })
      );
      expect(appendSpy).toHaveBeenCalledWith('is_fragile', 'true');
      expect(appendSpy).toHaveBeenCalledWith('notes', '');

      global.FormData = OrigFormData;
    });

    it('appends photo with correct MIME type for jpeg', () => {
      const appendSpy = jest.fn();
      const OrigFormData = global.FormData;
      global.FormData = jest.fn(() => ({ append: appendSpy })) as any;

      deliveryService.createDeliveryWithPhoto({}, '/path/to/photo.jpg');

      expect(appendSpy).toHaveBeenCalledWith('item_photo', {
        uri: '/path/to/photo.jpg',
        name: 'photo.jpg',
        type: 'image/jpeg',
      });

      global.FormData = OrigFormData;
    });

    it('appends photo with correct MIME type for png', () => {
      const appendSpy = jest.fn();
      const OrigFormData = global.FormData;
      global.FormData = jest.fn(() => ({ append: appendSpy })) as any;

      deliveryService.createDeliveryWithPhoto({}, '/path/to/image.png');

      expect(appendSpy).toHaveBeenCalledWith('item_photo', {
        uri: '/path/to/image.png',
        name: 'image.png',
        type: 'image/png',
      });

      global.FormData = OrigFormData;
    });

    it('does not append item_photo when photoUri is null', () => {
      const appendSpy = jest.fn();
      const OrigFormData = global.FormData;
      global.FormData = jest.fn(() => ({ append: appendSpy })) as any;

      deliveryService.createDeliveryWithPhoto({ name: 'test' }, null);

      const photoCall = appendSpy.mock.calls.find(
        (call: any[]) => call[0] === 'item_photo'
      );
      expect(photoCall).toBeUndefined();

      global.FormData = OrigFormData;
    });

    it('sends FormData with multipart/form-data header and 60s timeout', () => {
      const OrigFormData = global.FormData;
      global.FormData = jest.fn(() => ({ append: jest.fn() })) as any;

      deliveryService.createDeliveryWithPhoto({}, null);

      expect(mockInstance.post).toHaveBeenCalledWith(
        '/deliveries/create',
        expect.anything(),
        expect.objectContaining({
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        })
      );

      global.FormData = OrigFormData;
    });
  });

  describe('registerDriverWithDocuments - FormData creation', () => {
    it('appends data fields and photo fields with correct field names', () => {
      const appendSpy = jest.fn();
      const OrigFormData = global.FormData;
      global.FormData = jest.fn(() => ({ append: appendSpy })) as any;

      const data = {
        name: 'Driver One',
        vehicle_type: 'motorcycle',
        vehicle_info: { plate: 'ABC-123' },
      };

      const photos = {
        profile: '/photos/profile.jpg',
        license: '/photos/license.png',
        orcr: null,
        id: '/photos/id.jpg',
      };

      driverService.registerDriverWithDocuments(data, photos);

      // Data fields
      expect(appendSpy).toHaveBeenCalledWith('name', 'Driver One');
      expect(appendSpy).toHaveBeenCalledWith('vehicle_type', 'motorcycle');
      expect(appendSpy).toHaveBeenCalledWith(
        'vehicle_info',
        JSON.stringify({ plate: 'ABC-123' })
      );

      // Photo fields mapped to correct form field names
      expect(appendSpy).toHaveBeenCalledWith('profile_photo', {
        uri: '/photos/profile.jpg',
        name: 'profile.jpg',
        type: 'image/jpeg',
      });
      expect(appendSpy).toHaveBeenCalledWith('license_photo', {
        uri: '/photos/license.png',
        name: 'license.png',
        type: 'image/png',
      });
      expect(appendSpy).toHaveBeenCalledWith('id_photo', {
        uri: '/photos/id.jpg',
        name: 'id.jpg',
        type: 'image/jpeg',
      });

      // orcr is null so orcr_photo should NOT be appended
      const orcrCall = appendSpy.mock.calls.find(
        (call: any[]) => call[0] === 'orcr_photo'
      );
      expect(orcrCall).toBeUndefined();

      global.FormData = OrigFormData;
    });

    it('sends request to /driver/register with multipart headers', () => {
      const OrigFormData = global.FormData;
      global.FormData = jest.fn(() => ({ append: jest.fn() })) as any;

      driverService.registerDriverWithDocuments({}, {});

      expect(mockInstance.post).toHaveBeenCalledWith(
        '/driver/register',
        expect.anything(),
        expect.objectContaining({
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        })
      );

      global.FormData = OrigFormData;
    });
  });
});
