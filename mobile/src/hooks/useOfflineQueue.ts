import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { offlineQueue } from '../utils/offlineQueue';
import { rideService, deliveryService, orderService, chatService } from '../services/api';

const executeAction = async (action: { type: string; payload: any }): Promise<boolean> => {
  try {
    switch (action.type) {
      case 'cancel_ride':
        await rideService.cancelRide(action.payload.id, action.payload.reason);
        return true;
      case 'cancel_delivery':
        await deliveryService.cancelDelivery(action.payload.id, action.payload.reason);
        return true;
      case 'cancel_order':
        await orderService.cancelOrder(action.payload.id);
        return true;
      case 'send_message':
        await chatService.sendMessage(action.payload.chatId, action.payload.receiverId, action.payload.message);
        return true;
      case 'rate':
        if (action.payload.serviceType === 'ride') {
          await rideService.rateRide(action.payload.id, action.payload.rating, action.payload.review || '');
        } else if (action.payload.serviceType === 'delivery') {
          await deliveryService.rateDelivery(action.payload.id, action.payload.rating);
        } else {
          await orderService.rateOrder(action.payload.id, action.payload.rating);
        }
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
};

export function useOfflineQueue() {
  const processingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      await offlineQueue.processQueue(executeAction);
    } finally {
      processingRef.current = false;
    }
  }, []);

  // Process queue when network comes back online
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        processQueue();
      }
    });
    return () => unsubscribe();
  }, [processQueue]);

  // Process queue when app comes to foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        processQueue();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [processQueue]);

  // Process on mount
  useEffect(() => {
    processQueue();
  }, [processQueue]);

  return { enqueue: offlineQueue.enqueue.bind(offlineQueue), processQueue };
}
