import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

interface QueuedAction {
  id: string;
  type: 'cancel_ride' | 'cancel_delivery' | 'cancel_order' | 'send_message' | 'rate';
  payload: any;
  createdAt: number;
  retries: number;
}

const QUEUE_KEY = '@oneride_offline_queue';

export const offlineQueue = {
  async getQueue(): Promise<QueuedAction[]> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async enqueue(type: QueuedAction['type'], payload: any): Promise<void> {
    const queue = await this.getQueue();
    queue.push({
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      createdAt: Date.now(),
      retries: 0,
    });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },

  async dequeue(id: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter(a => a.id !== id);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
  },

  async processQueue(executor: (action: QueuedAction) => Promise<boolean>): Promise<number> {
    const state = await NetInfo.fetch();
    if (!state.isConnected) return 0;

    const queue = await this.getQueue();
    if (queue.length === 0) return 0;

    let processed = 0;
    for (const action of queue) {
      try {
        const success = await executor(action);
        if (success) {
          await this.dequeue(action.id);
          processed++;
        } else {
          // Increment retries, remove if too many
          action.retries++;
          if (action.retries >= 3) {
            await this.dequeue(action.id);
          }
        }
      } catch {
        action.retries++;
        if (action.retries >= 3) {
          await this.dequeue(action.id);
        }
      }
    }
    // Save updated retries
    const remaining = await this.getQueue();
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    return processed;
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
  },

  async size(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  },
};
