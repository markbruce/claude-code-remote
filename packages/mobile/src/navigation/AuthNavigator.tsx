/**
 * CC Remote - Authentication Navigator
 * Handles login and authentication flow
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeStore } from '../store/theme';
import { LoginScreen } from '../screens/LoginScreen';

export interface AuthParamList {
  Login: undefined;
}

export type AuthNavigationProp = NativeStackNavigationProp<AuthParamList>;

const Stack = createNativeStackNavigator<AuthParamList>();

export function AuthNavigator(): React.JSX.Element {
  const { isDark } = useThemeStore();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: isDark ? '#030712' : '#f9fafb',
        },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}
