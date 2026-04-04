import { calculateDistance, getRoadDistance } from '../../hooks/useDistance';
import { LocationData } from '../../types';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('calculateDistance', () => {
  it('returns 0 when point1 latitude is null', () => {
    const point1 = { address: '', latitude: null, longitude: 124.0 } as unknown as LocationData;
    const point2 = { address: '', latitude: 10.0, longitude: 124.0 };
    expect(calculateDistance(point1, point2)).toBe(0);
  });

  it('returns 0 when point2 latitude is null', () => {
    const point1 = { address: '', latitude: 10.0, longitude: 124.0 };
    const point2 = { address: '', latitude: null, longitude: 124.0 } as unknown as LocationData;
    expect(calculateDistance(point1, point2)).toBe(0);
  });

  it('returns 0 when both points are the same location', () => {
    const point = { address: 'Test', latitude: 10.0, longitude: 124.0 };
    expect(calculateDistance(point, point)).toBe(0);
  });

  it('calculates distance between two nearby points correctly', () => {
    // Balingasag to Cagayan de Oro (~40km straight line)
    const balingasag: LocationData = { address: 'Balingasag', latitude: 8.7541, longitude: 124.7775 };
    const cdo: LocationData = { address: 'CDO', latitude: 8.4542, longitude: 124.6319 };
    const distance = calculateDistance(balingasag, cdo);
    // Should be roughly 35-40 km
    expect(distance).toBeGreaterThan(30);
    expect(distance).toBeLessThan(50);
  });

  it('calculates a known long distance (Manila to Cebu ~500km)', () => {
    const manila: LocationData = { address: 'Manila', latitude: 14.5995, longitude: 120.9842 };
    const cebu: LocationData = { address: 'Cebu', latitude: 10.3157, longitude: 123.8854 };
    const distance = calculateDistance(manila, cebu);
    // Haversine straight-line should be roughly 500-570 km
    expect(distance).toBeGreaterThan(480);
    expect(distance).toBeLessThan(600);
  });

  it('returns distance rounded to 1 decimal place', () => {
    const point1: LocationData = { address: 'A', latitude: 10.0, longitude: 124.0 };
    const point2: LocationData = { address: 'B', latitude: 10.1, longitude: 124.1 };
    const distance = calculateDistance(point1, point2);
    const decimalPlaces = (distance.toString().split('.')[1] || '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(1);
  });
});

describe('getRoadDistance', () => {
  it('returns zeros when point1 latitude is null', async () => {
    const point1 = { address: '', latitude: null, longitude: 124.0 } as unknown as LocationData;
    const point2: LocationData = { address: '', latitude: 10.0, longitude: 124.0 };
    const result = await getRoadDistance(point1, point2);
    expect(result).toEqual({ distance: 0, duration: 0, isRoad: false });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns zeros when point2 latitude is null', async () => {
    const point1: LocationData = { address: '', latitude: 10.0, longitude: 124.0 };
    const point2 = { address: '', latitude: null, longitude: 124.0 } as unknown as LocationData;
    const result = await getRoadDistance(point1, point2);
    expect(result).toEqual({ distance: 0, duration: 0, isRoad: false });
  });

  it('returns road distance from OSRM response', async () => {
    const osrmResponse = {
      code: 'Ok',
      routes: [{ distance: 45000, duration: 2700 }], // 45km, 45min
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(osrmResponse),
    });

    const point1: LocationData = { address: 'A', latitude: 8.7541, longitude: 124.7775 };
    const point2: LocationData = { address: 'B', latitude: 8.4542, longitude: 124.6319 };
    const result = await getRoadDistance(point1, point2);

    expect(result.isRoad).toBe(true);
    expect(result.distance).toBe(45); // 45000m = 45km
    expect(result.duration).toBe(45); // 2700s = 45min
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('router.project-osrm.org'),
      expect.objectContaining({
        headers: { 'User-Agent': 'OneRide-App/1.0' },
      }),
    );
  });

  it('rounds distance to 1 decimal and ceils duration to minutes', async () => {
    const osrmResponse = {
      code: 'Ok',
      routes: [{ distance: 12345, duration: 925 }], // 12.345km, 15.4min
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(osrmResponse),
    });

    const point1: LocationData = { address: 'A', latitude: 10.0, longitude: 124.0 };
    const point2: LocationData = { address: 'B', latitude: 10.1, longitude: 124.1 };
    const result = await getRoadDistance(point1, point2);

    expect(result.distance).toBe(12.3); // rounded to 1 decimal
    expect(result.duration).toBe(16); // ceil(925/60) = ceil(15.42) = 16
    expect(result.isRoad).toBe(true);
  });

  it('falls back to haversine * 1.4 when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const point1: LocationData = { address: 'A', latitude: 8.7541, longitude: 124.7775 };
    const point2: LocationData = { address: 'B', latitude: 8.4542, longitude: 124.6319 };
    const result = await getRoadDistance(point1, point2);

    const straightLine = calculateDistance(point1, point2);
    const expectedRoad = Math.round(straightLine * 1.4 * 10) / 10;

    expect(result.isRoad).toBe(false);
    expect(result.distance).toBe(expectedRoad);
    expect(result.duration).toBe(Math.ceil((expectedRoad / 30) * 60));
    // Should have been called twice (initial + 1 retry)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to haversine when OSRM returns non-Ok code', async () => {
    const osrmResponse = { code: 'NoRoute', routes: [] };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(osrmResponse),
    });

    const point1: LocationData = { address: 'A', latitude: 10.0, longitude: 124.0 };
    const point2: LocationData = { address: 'B', latitude: 10.5, longitude: 124.5 };
    const result = await getRoadDistance(point1, point2);

    expect(result.isRoad).toBe(false);
    expect(result.distance).toBeGreaterThan(0);
  });

  it('retries once on 500 server error then falls back', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const point1: LocationData = { address: 'A', latitude: 10.0, longitude: 124.0 };
    const point2: LocationData = { address: 'B', latitude: 10.1, longitude: 124.1 };
    const result = await getRoadDistance(point1, point2);

    expect(result.isRoad).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries once on 429 rate limit then falls back', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 429 });

    const point1: LocationData = { address: 'A', latitude: 10.0, longitude: 124.0 };
    const point2: LocationData = { address: 'B', latitude: 10.1, longitude: 124.1 };
    const result = await getRoadDistance(point1, point2);

    expect(result.isRoad).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns zeros immediately on AbortError', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortError);

    const point1: LocationData = { address: 'A', latitude: 10.0, longitude: 124.0 };
    const point2: LocationData = { address: 'B', latitude: 10.1, longitude: 124.1 };
    const result = await getRoadDistance(point1, point2);

    expect(result).toEqual({ distance: 0, duration: 0, isRoad: false });
    // Should NOT retry on abort
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('passes abort signal to fetch', async () => {
    const controller = new AbortController();
    const osrmResponse = { code: 'Ok', routes: [{ distance: 10000, duration: 600 }] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(osrmResponse),
    });

    const point1: LocationData = { address: 'A', latitude: 10.0, longitude: 124.0 };
    const point2: LocationData = { address: 'B', latitude: 10.1, longitude: 124.1 };
    await getRoadDistance(point1, point2, controller.signal);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('constructs OSRM URL with correct coordinate order (lng,lat)', async () => {
    const osrmResponse = { code: 'Ok', routes: [{ distance: 5000, duration: 300 }] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(osrmResponse),
    });

    const point1: LocationData = { address: 'A', latitude: 10.123, longitude: 124.456 };
    const point2: LocationData = { address: 'B', latitude: 10.789, longitude: 124.012 };
    await getRoadDistance(point1, point2);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('124.456,10.123;124.012,10.789');
  });
});
