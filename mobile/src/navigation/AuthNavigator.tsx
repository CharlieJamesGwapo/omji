import React from 'react';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';

import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';
import OTPScreen from '../screens/Auth/OTPScreen';
import RiderRegistrationScreen from '../screens/Auth/RiderRegistrationScreen';

const Stack = createStackNavigator();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS, gestureEnabled: true }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="OTP" component={OTPScreen} />
      <Stack.Screen
        name="RiderRegistration"
        component={RiderRegistrationScreen}
        options={{
          headerShown: true,
          title: 'Become a Rider',
          headerStyle: { backgroundColor: '#10B981' },
          headerTintColor: '#ffffff',
        }}
      />
    </Stack.Navigator>
  );
}
