import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import RiderDashboardScreen from '../screens/Rider/RiderDashboardScreen';
import RiderEarningsScreen from '../screens/Rider/RiderEarningsScreen';
import RiderProfileScreen from '../screens/Rider/RiderProfileScreen';
import TrackingScreen from '../screens/Main/TrackingScreen';
import ChatScreen from '../screens/Main/ChatScreen';

const Stack = createStackNavigator();

export default function RiderNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#10B981' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen name="RiderDashboard" component={RiderDashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RiderEarnings" component={RiderEarningsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RiderProfile" component={RiderProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Tracking" component={TrackingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
