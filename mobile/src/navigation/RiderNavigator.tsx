import React from 'react';
import { View, Platform } from 'react-native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { verticalScale, fontScale, moderateScale } from '../utils/responsive';

import RiderDashboardScreen from '../screens/Rider/RiderDashboardScreen';
import RiderEarningsScreen from '../screens/Rider/RiderEarningsScreen';
import RiderProfileScreen from '../screens/Rider/RiderProfileScreen';
import TrackingScreen from '../screens/Main/TrackingScreen';
import ChatScreen from '../screens/Main/ChatScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function RiderTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          let iconName: any;
          if (route.name === 'Dashboard') {
            iconName = focused ? 'speedometer' : 'speedometer-outline';
          } else if (route.name === 'Earnings') {
            iconName = focused ? 'wallet' : 'wallet-outline';
          } else if (route.name === 'RiderProfileTab') {
            iconName = focused ? 'person-circle' : 'person-circle-outline';
          }
          return (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 6 }}>
              {focused && (
                <View style={{
                  position: 'absolute',
                  top: 0,
                  width: 32,
                  height: 3,
                  borderRadius: 1.5,
                  backgroundColor: COLORS.success,
                }} />
              )}
              <Ionicons name={iconName} size={22} color={color} />
            </View>
          );
        },
        tabBarActiveTintColor: COLORS.success,
        tabBarInactiveTintColor: '#B0B7C3',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 0.5,
          borderTopColor: '#F3F4F6',
          elevation: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          paddingBottom: bottomInset,
          paddingTop: 4,
          height: 56 + bottomInset,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600' as const,
          marginTop: 0,
          marginBottom: 2,
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
