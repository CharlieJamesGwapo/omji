import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, LogBox, Text, TouchableOpacity } from 'react-native';

// Context
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { NetworkProvider, useNetwork } from './src/context/NetworkContext';

// No Internet Screen
import NoInternetScreen from './src/screens/NoInternetScreen';

// Navigators
import AuthNavigator from './src/navigation/AuthNavigator';
import MainNavigator from './src/navigation/MainNavigator';
import RiderNavigator from './src/navigation/RiderNavigator';

// Ignore specific non-critical warnings
LogBox.ignoreLogs([
  'Warning: ...',
  'Sending `onAnimatedValueUpdate`',
  'Non-serializable values were found in the navigation state',
]);

// Loading Screen
const LoadingScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#3B82F6' }}>
    <ActivityIndicator size="large" color="#ffffff" />
  </View>
);

// Root Navigator
const RootNavigator = () => {
  const { user, loading, logout } = useAuth();
  const { isConnected } = useNetwork();

  // Block app when no internet connection
  if (!isConnected) {
    return <NoInternetScreen />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  // If admin user tries to access mobile app, show message
  if (user && user.role === 'admin') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#F3F4F6' }}>
        <View style={{ backgroundColor: '#ffffff', padding: 30, borderRadius: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 }}>
          <Ionicons name="desktop-outline" size={80} color="#DC2626" style={{ marginBottom: 20 }} />
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 10, textAlign: 'center' }}>Admin Access</Text>
          <Text style={{ fontSize: 16, color: '#6B7280', marginBottom: 20, textAlign: 'center', lineHeight: 24 }}>
            {"Admin panel is only available on the web interface.\n\nPlease visit the web admin dashboard at:\n"}
            <Text style={{ color: '#DC2626', fontWeight: 'bold' }}>{"http://localhost:3001"}</Text>
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
        <AuthNavigator />
      ) : user.role === 'rider' || user.role === 'driver' ? (
        <RiderNavigator />
      ) : (
        <MainNavigator />
      )}
    </NavigationContainer>
  );
};

// Main App
export default function App() {
  return (
    <NetworkProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </NetworkProvider>
  );
}
