import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { driverService } from '../services/api';
import { isValidCoord } from '../utils/geo';

export const TRIP_LOCATION_TASK = 'trip-location-task';

TaskManager.defineTask(TRIP_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody) => {
    if (error) return;
    const { locations } = (data as any) || {};
    const loc = locations?.[0];
    if (!loc) return;
    const { latitude, longitude } = loc.coords || {};
    if (!isValidCoord(latitude, longitude)) return;
    try {
        await driverService.setAvailability({ available: true, latitude, longitude });
    } catch {
        // Backend unreachable — next tick retries. Don't crash the task.
    }
});

export async function startTripLocationService(): Promise<boolean> {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return false;
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    if (bg !== 'granted') return false;
    const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK);
    if (alreadyRunning) return true;
    await Location.startLocationUpdatesAsync(TRIP_LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 10000,
        distanceInterval: 20,
        foregroundService: {
            notificationTitle: 'ONE RIDE is tracking your trip',
            notificationBody: 'Tap to return to the app',
            notificationColor: '#000000',
        },
    });
    return true;
}

export async function stopTripLocationService(): Promise<void> {
    try {
        const running = await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK);
        if (running) await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK);
    } catch {
        // Ignore — task was never started or already stopped.
    }
}
