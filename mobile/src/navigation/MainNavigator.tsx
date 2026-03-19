import React from 'react';
import { View, Platform } from 'react-native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { verticalScale, fontScale, moderateScale } from '../utils/responsive';

// Main Tab Screens
import HomeScreen from '../screens/Main/HomeScreen';
import StoresScreen from '../screens/Main/StoresScreen';
import OrdersScreen from '../screens/Main/OrdersScreen';
import ProfileScreen from '../screens/Main/ProfileScreen';

// Stack Screens
import PasugoScreen from '../screens/Main/PasugoScreen';
import PasabayScreen from '../screens/Main/PasabayScreen';
import PasundoScreen from '../screens/Main/PasundoScreen';
import StoreDetailScreen from '../screens/Main/StoreDetailScreen';
import CartScreen from '../screens/Main/CartScreen';
import TrackingScreen from '../screens/Main/TrackingScreen';
import ChatScreen from '../screens/Main/ChatScreen';
import WalletScreen from '../screens/Main/WalletScreen';
import RideHistoryScreen from '../screens/Main/RideHistoryScreen';
import EditProfileScreen from '../screens/Main/EditProfileScreen';
import SavedAddressesScreen from '../screens/Main/SavedAddressesScreen';
import PaymentMethodsScreen from '../screens/Main/PaymentMethodsScreen';
import FavoritesScreen from '../screens/Main/FavoritesScreen';
import NotificationsScreen from '../screens/Main/NotificationsScreen';
import PaymentScreen from '../screens/Main/PaymentScreen';
import RiderRegistrationScreen from '../screens/Auth/RiderRegistrationScreen';
import RiderSelectionScreen from '../screens/Main/RiderSelectionScreen';
import RiderWaitingScreen from '../screens/Main/RiderWaitingScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function MainTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          let iconName: any;
          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Services') {
            iconName = focused ? 'storefront' : 'storefront-outline';
          } else if (route.name === 'Orders') {
            iconName = focused ? 'receipt' : 'receipt-outline';
          } else if (route.name === 'Profile') {
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
                  backgroundColor: '#3B82F6',
                }} />
              )}
              <Ionicons name={iconName} size={22} color={color} />
            </View>
          );
        },
        tabBarActiveTintColor: '#3B82F6',
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
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Services" component={StoresScreen} options={{ title: 'Stores' }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: 'Orders' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#3B82F6' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: 'bold' },
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        gestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Pasugo" component={PasugoScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Pasabay" component={PasabayScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Pasundo" component={PasundoScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RiderSelection" component={RiderSelectionScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RiderWaiting" component={RiderWaitingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="StoreDetail" component={StoreDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Cart" component={CartScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Tracking" component={TrackingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Wallet" component={WalletScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RideHistory" component={RideHistoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RiderRegistration" component={RiderRegistrationScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SavedAddresses" component={SavedAddressesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
