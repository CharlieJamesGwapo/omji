import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import type { EventSubscription } from 'expo-modules-core';
import { pushService } from '../services/api';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications(navigation: any) {
  const [expoPushToken, setExpoPushToken] = useState<string>('');
  const notificationListener = useRef<EventSubscription | null>(null);
  const responseListener = useRef<EventSubscription | null>(null);

  useEffect(() => {
    let isMounted = true;

    registerForPushNotifications().then(token => {
      if (token && isMounted) {
        setExpoPushToken(token);
        // Send token to backend
        pushService.registerToken(token, Platform.OS).catch(() => {});
      }
    });

    // Listen for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      // Notification received in foreground - handler above shows it
    });

    // Listen for user tapping on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      if (!isMounted) return;

      const data = response.notification.request.content.data;
      if (!data?.type) return;

      try {
        switch (data.type) {
          case 'chat':
            if (data.rideId) {
              navigation.navigate('Chat', {
                rideId: Number(data.rideId),
                rider: { id: Number(data.senderId), name: data.senderName || 'Driver' },
              });
            }
            break;

          case 'ride_accepted':
          case 'ride_update':
          case 'ride':
            navigation.navigate('Tracking', {
              type: 'ride',
              rideId: data.ride_id,
              pickup: data.pickup || '',
              dropoff: data.dropoff || '',
              fare: data.fare || 0,
            });
            break;

          case 'delivery_update':
          case 'delivery':
            navigation.navigate('Tracking', {
              type: 'delivery',
              rideId: data.delivery_id || data.ride_id,
              pickup: data.pickup || '',
              dropoff: data.dropoff || '',
              fare: data.fare || 0,
            });
            break;

          case 'order_update':
          case 'order':
            navigation.navigate('Orders');
            break;

          case 'wallet':
            navigation.navigate('Wallet');
            break;

          case 'promo':
            navigation.navigate('Home');
            break;

          case 'ride_request':
            // No navigation needed - RiderRequestModal handles this
            break;

          default:
            break;
        }
      } catch {
        // Prevent crashes from invalid navigation data
      }
    });

    return () => {
      isMounted = false;
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [navigation]);

  return expoPushToken;
}

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push notifications don't work on simulator
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '58003a41-a27a-47ac-b17a-886e1f190db9',
    });
    return tokenData.data;
  } catch {
    return null;
  }
}
