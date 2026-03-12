import React from 'react';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { verticalScale, fontScale } from '../utils/responsive';

import RiderDashboardScreen from '../screens/Rider/RiderDashboardScreen';
import RiderEarningsScreen from '../screens/Rider/RiderEarningsScreen';
import RiderProfileScreen from '../screens/Rider/RiderProfileScreen';
import TrackingScreen from '../screens/Main/TrackingScreen';
import ChatScreen from '../screens/Main/ChatScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function RiderTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any;
          if (route.name === 'Dashboard') {
            iconName = focused ? 'speedometer' : 'speedometer-outline';
          } else if (route.name === 'Earnings') {
            iconName = focused ? 'wallet' : 'wallet-outline';
          } else if (route.name === 'RiderProfileTab') {
            iconName = focused ? 'person' : 'person-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.success,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          paddingBottom: verticalScale(5),
          paddingTop: verticalScale(5),
          height: verticalScale(60),
        },
        tabBarLabelStyle: {
          fontSize: fontScale(12),
          fontWeight: 'bold' as const,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={RiderDashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Earnings" component={RiderEarningsScreen} options={{ title: 'Earnings' }} />
      <Tab.Screen name="RiderProfileTab" component={RiderProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

export default function RiderNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.success },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: 'bold' },
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        gestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <Stack.Screen name="RiderTabs" component={RiderTabs} options={{ headerShown: false }} />
      <Stack.Screen name="RiderDashboard" component={RiderDashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RiderEarnings" component={RiderEarningsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RiderProfile" component={RiderProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Tracking" component={TrackingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
