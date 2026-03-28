import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, LogBox, Text, TouchableOpacity, ScrollView } from 'react-native';

// Context
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { NetworkProvider, useNetwork } from './src/context/NetworkContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { ThemeProvider } from './src/context/ThemeContext';

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
  'Encountered two children with the same key',
  'SafeAreaView has been deprecated',
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
            {"Admin panel is only available on the web interface.\n\nPlease contact your administrator for dashboard access."}
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
    <NavigationContainer onUnhandledAction={(action) => { console.warn('Unhandled navigation action:', action); }}>
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

// Error Boundary to catch "Text strings must be rendered within <Text>" and show component stack
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null; errorInfo: React.ErrorInfo | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🔴 ErrorBoundary caught:', error.message);
    console.error('🔴 Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo });
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#FEF2F2' }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#DC2626', marginBottom: 10 }}>Something went wrong</Text>
          <Text style={{ fontSize: 14, color: '#991B1B', marginBottom: 10, textAlign: 'center' }}>{this.state.error?.message}</Text>
          <ScrollView style={{ maxHeight: 300, backgroundColor: '#ffffff', borderRadius: 8, padding: 10, width: '100%' }}>
            <Text style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace' }}>{this.state.errorInfo?.componentStack || 'No stack available'}</Text>
          </ScrollView>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{ marginTop: 20, backgroundColor: '#3B82F6', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: 'bold' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// Main App
export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <NetworkProvider>
          <LanguageProvider>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </LanguageProvider>
        </NetworkProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
