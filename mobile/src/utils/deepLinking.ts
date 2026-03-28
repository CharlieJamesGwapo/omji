import { LinkingOptions } from '@react-navigation/native';

export const linking: LinkingOptions<any> = {
  prefixes: ['omji://', 'https://omji.app'],
  config: {
    screens: {
      Main: {
        screens: {
          MainTabs: {
            screens: {
              Home: 'home',
              Orders: 'orders',
            },
          },
          StoreDetail: 'store/:storeId',
          Tracking: 'tracking/:rideId',
          Wallet: 'wallet',
          Chat: 'chat/:rideId',
          Referral: 'referral',
          Search: 'search',
        },
      },
    },
  },
};
