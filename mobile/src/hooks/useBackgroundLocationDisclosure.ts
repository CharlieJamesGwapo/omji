import React, { useCallback, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundLocationDisclosureModal from '../components/BackgroundLocationDisclosureModal';

// Bump the suffix if the disclosure wording changes materially so existing
// users re-see the updated screen.
const STORAGE_KEY = 'rider_bg_location_disclosure_v1';

interface DisclosureApi {
  ensureDisclosed: () => Promise<boolean>;
  disclosureElement: React.ReactElement;
}

export function useBackgroundLocationDisclosure(): DisclosureApi {
  const [visible, setVisible] = useState(false);
  const resolverRef = useRef<((accepted: boolean) => void) | null>(null);

  const ensureDisclosed = useCallback(async (): Promise<boolean> => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === 'accepted') return true;
    } catch {
      // Storage unreadable — fall through and show the modal. Better to
      // ask twice than to skip the Play-required disclosure entirely.
    }
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setVisible(true);
    });
  }, []);

  const finalize = useCallback(async (accepted: boolean) => {
    setVisible(false);
    if (accepted) {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, 'accepted');
      } catch {
        // Storage write failure is non-fatal; user will see disclosure again next trip.
      }
    }
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.(accepted);
  }, []);

  const disclosureElement = React.createElement(BackgroundLocationDisclosureModal, {
    visible,
    onAllow: () => finalize(true),
    onDeny: () => finalize(false),
  });

  return { ensureDisclosed, disclosureElement };
}
