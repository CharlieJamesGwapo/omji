import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';

interface NetworkContextType {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  connectionType: string | null;
}

const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  isInternetReachable: true,
  connectionType: null,
});

export const useNetwork = () => useContext(NetworkContext);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NetworkContextType>({
    isConnected: true,
    isInternetReachable: true,
    connectionType: null,
  });
  const listenerFiredRef = useRef(false);

  useEffect(() => {
    listenerFiredRef.current = false;

    // Fetch real state immediately instead of assuming connected
    NetInfo.fetch().then((netState) => {
      // Only apply initial fetch if listener hasn't fired yet (avoids race condition)
      if (!listenerFiredRef.current) {
        setState({
          isConnected: netState.isConnected ?? true,
          isInternetReachable: netState.isInternetReachable,
          connectionType: netState.type,
        });
      }
    }).catch(() => {
      // NetInfo fetch failed — keep default optimistic state
    });

    const unsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
      listenerFiredRef.current = true;
      setState({
        isConnected: netState.isConnected ?? true,
        isInternetReachable: netState.isInternetReachable,
        connectionType: netState.type,
      });
    });

    return () => unsubscribe();
  }, []);

  // Re-check on app foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        NetInfo.fetch().then((netState) => {
          setState({
            isConnected: netState.isConnected ?? true,
            isInternetReachable: netState.isInternetReachable,
            connectionType: netState.type,
          });
        }).catch(() => {
          // NetInfo fetch failed on foreground — keep current state
        });
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  return (
    <NetworkContext.Provider value={state}>
      {children}
    </NetworkContext.Provider>
  );
}
