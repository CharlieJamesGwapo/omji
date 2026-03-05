import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, LogBox, Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Context
import { AuthProvider, useAuth } from './src/context/AuthContext';

// Screens - Auth
import LoginScreen from './src/screens/Auth/LoginScreen';
import RegisterScreen from './src/screens/Auth/RegisterScreen';
import OTPScreen from './src/screens/Auth/OTPScreen';

// Screens - Main
import HomeScreen from './src/screens/Main/HomeScreen';
import PasugoScreen from './src/screens/Main/PasugoScreen';
import PasabayScreen from './src/screens/Main/PasabayScreen';
import PasundoScreen from './src/screens/Main/PasundoScreen';
import StoresScreen from './src/screens/Main/StoresScreen';
import StoreDetailScreen from './src/screens/Main/StoreDetailScreen';
import CartScreen from './src/screens/Main/CartScreen';
import OrdersScreen from './src/screens/Main/OrdersScreen';
import ProfileScreen from './src/screens/Main/ProfileScreen';
import TrackingScreen from './src/screens/Main/TrackingScreen';
import ChatScreen from './src/screens/Main/ChatScreen';
import WalletScreen from './src/screens/Main/WalletScreen';
import RideHistoryScreen from './src/screens/Main/RideHistoryScreen';

// Screens - Rider
import RiderDashboardScreen from './src/screens/Rider/RiderDashboardScreen';
import RiderEarningsScreen from './src/screens/Rider/RiderEarningsScreen';
import RiderProfileScreen from './src/screens/Rider/RiderProfileScreen';
import RiderRegistrationScreen from './src/screens/Auth/RiderRegistrationScreen';

// Admin screens removed - Admin functionality is web-only

// Ignore specific warnings
LogBox.ignoreLogs(['Warning: ...']);
LogBox.ignoreAllLogs();

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Loading Screen
const LoadingScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#3B82F6' }}>
    <ActivityIndicator size="large" color="#ffffff" />
  </View>
);

// Auth Stack
const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
    <Stack.Screen name="OTP" component={OTPScreen} />
    <Stack.Screen name="RiderRegistration" component={RiderRegistrationScreen} options={{ headerShown: true, title: 'Become a Rider', headerStyle: { backgroundColor: '#10B981' }, headerTintColor: '#ffffff' }} />
  </Stack.Navigator>
);

// Main Tabs
const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        let iconName: any;

        if (route.name === 'Home') {
          iconName = focused ? 'home' : 'home-outline';
        } else if (route.name === 'Services') {
          iconName = focused ? 'grid' : 'grid-outline';
        } else if (route.name === 'Orders') {
          iconName = focused ? 'receipt' : 'receipt-outline';
        } else if (route.name === 'Profile') {
          iconName = focused ? 'person' : 'person-outline';
        }

        return <Ionicons name={iconName} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#3B82F6',
      tabBarInactiveTintColor: '#9CA3AF',
      tabBarStyle: {
        backgroundColor: '#ffffff',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        paddingBottom: 5,
        paddingTop: 5,
        height: 60,
      },
      tabBarLabelStyle: {
        fontSize: 12,
        fontWeight: '600',
      },
      headerShown: false,
    })}
  >
    <Tab.Screen
      name="Home"
      component={HomeScreen}
      options={{ title: 'Home' }}
    />
    <Tab.Screen
      name="Services"
      component={StoresScreen}
      options={{ title: 'Stores' }}
    />
    <Tab.Screen
      name="Orders"
      component={OrdersScreen}
      options={{ title: 'Orders' }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{ title: 'Profile' }}
    />
  </Tab.Navigator>
);

// Main Stack
const MainStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerStyle: {
        backgroundColor: '#3B82F6',
      },
      headerTintColor: '#ffffff',
      headerTitleStyle: {
        fontWeight: 'bold',
      },
    }}
  >
    <Stack.Screen
      name="MainTabs"
      component={MainTabs}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="Pasugo"
      component={PasugoScreen}
      options={{ title: 'Pasugo - Delivery' }}
    />
    <Stack.Screen
      name="Pasabay"
      component={PasabayScreen}
      options={{ title: 'Pasabay - Ride Sharing' }}
    />
    <Stack.Screen
      name="Pasundo"
      component={PasundoScreen}
      options={{ title: 'Pasundo - Pick-up Service' }}
    />
    <Stack.Screen
      name="StoreDetail"
      component={StoreDetailScreen}
      options={{ title: 'Store' }}
    />
    <Stack.Screen
      name="Cart"
      component={CartScreen}
      options={{ title: 'Shopping Cart' }}
    />
    <Stack.Screen
      name="Tracking"
      component={TrackingScreen}
      options={{ title: 'Track Order' }}
    />
    <Stack.Screen
      name="Chat"
      component={ChatScreen}
      options={{ title: 'Chat with Rider' }}
    />
    <Stack.Screen
      name="Wallet"
      component={WalletScreen}
      options={{ title: 'OMJI Wallet' }}
    />
    <Stack.Screen
      name="RideHistory"
      component={RideHistoryScreen}
      options={{ title: 'Ride History' }}
    />
    <Stack.Screen
      name="RiderRegistration"
      component={RiderRegistrationScreen}
      options={{ title: 'Become a Rider - Driver Signup' }}
    />
  </Stack.Navigator>
);

// Admin Stack removed - Admin uses web interface only

// Rider Stack
const RiderStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerStyle: {
        backgroundColor: '#10B981',
      },
      headerTintColor: '#ffffff',
      headerTitleStyle: {
        fontWeight: 'bold',
      },
    }}
  >
    <Stack.Screen
      name="RiderDashboard"
      component={RiderDashboardScreen}
      options={{ title: 'Rider Dashboard' }}
    />
    <Stack.Screen
      name="RiderEarnings"
      component={RiderEarningsScreen}
      options={{ title: 'Earnings' }}
    />
    <Stack.Screen
      name="RiderProfile"
      component={RiderProfileScreen}
      options={{ title: 'Rider Profile' }}
    />
  </Stack.Navigator>
);

// Root Navigator
const RootNavigator = () => {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  // If admin user tries to access mobile app, show message and redirect to web
  if (user && user.role === 'admin') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#F3F4F6' }}>
        <View style={{ backgroundColor: '#ffffff', padding: 30, borderRadius: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 }}>
          <Ionicons name="desktop-outline" size={80} color="#DC2626" style={{ marginBottom: 20 }} />
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 10, textAlign: 'center' }}>Admin Access</Text>
          <Text style={{ fontSize: 16, color: '#6B7280', marginBottom: 20, textAlign: 'center', lineHeight: 24 }}>
            Admin panel is only available on the web interface.
            {'\n\n'}
            Please visit the web admin dashboard at:
            {'\n'}
            <Text style={{ color: '#DC2626', fontWeight: 'bold' }}>http://localhost:3001</Text>
          </Text>
          <TouchableOpacity
            onPress={logout}
            style={{ backgroundColor: '#DC2626', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 12, marginTop: 10 }}
          >
            <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: 'bold' }}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      {!user ? (
        <AuthStack />
      ) : user.role === 'rider' ? (
        <RiderStack />
      ) : (
        <MainStack />
      )}
    </NavigationContainer>
  );
};

// Main App
export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
