import { useEffect, useRef } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

export function useAppUpdates() {
  const checkedRef = useRef(false);

  const checkForUpdate = async () => {
    if (__DEV__) return; // Skip in development
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        Alert.alert(
          'Update Available',
          'A new version of OMJI is ready. Restart to apply the update.',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Restart Now', onPress: () => Updates.reloadAsync() },
          ]
        );
      }
    } catch {
      // Silent fail — update check is non-critical
    }
  };

  // Check on mount (once)
  useEffect(() => {
    if (!checkedRef.current) {
      checkedRef.current = true;
      checkForUpdate();
    }
  }, []);

  // Check when app comes to foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkForUpdate();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);
}
