/**
 * CC Remote - Main Navigator
 * Post-login navigation with bottom tabs and stack navigation
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { RouteProp } from '@react-navigation/native';
import { useThemeStore } from '../store/theme';
import { colors } from '../theme/colors';
import type { RootStackParamList, TabParamList } from './types';

// Screens
import { HomeScreen } from '../screens/HomeScreen';
import { MachinesScreen } from '../screens/MachinesScreen';
import { ProjectsScreen } from '../screens/ProjectsScreen';
import { WorkspaceScreen } from '../screens/WorkspaceScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { FileBrowserScreen } from '../screens/FileBrowserScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

import type {
  HomeScreenParams,
  MachinesScreenParams,
  ProjectsScreenParams,
  ChatScreenParams,
  FileBrowserScreenParams,
  SettingsScreenParams,
} from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Tab Navigator for bottom navigation
function TabNavigator(): React.JSX.Element {
  const { isDark } = useThemeStore();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? colors.background.cardDark : colors.background.card,
          borderTopColor: isDark ? colors.border.dark : colors.border.light,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        tabBarActiveTintColor: colors.primary[600],
        tabBarInactiveTintColor: colors.text.secondary,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => (
            <TabIcon name="home" color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="MachinesTab"
        component={MachinesScreen}
        options={{
          tabBarLabel: 'Machines',
          tabBarIcon: ({ color }) => (
            <TabIcon name="server" color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ProjectsTab"
        component={ProjectsScreen}
        options={{
          tabBarLabel: 'Projects',
          tabBarIcon: ({ color }) => (
            <TabIcon name="folder" color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => (
            <TabIcon name="settings" color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// Simple icon component for tabs (using text for now)
function TabIcon({ name, color }: { name: string; color: string }): React.JSX.Element {
  const icons: Record<string, string> = {
    home: '',
    server: '',
    folder: '',
    settings: '',
  };

  return <Text style={{ color, fontSize: 20 }}>{icons[name] || '•'}</Text>;
}

// Main Stack Navigator
export function MainNavigator(): React.JSX.Element {
  const { isDark } = useThemeStore();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        contentStyle: {
          backgroundColor: isDark ? colors.background.dark : colors.background.light,
        },
        headerStyle: {
          backgroundColor: isDark ? colors.background.cardDark : colors.background.card,
        },
        headerTintColor: isDark ? colors.text.darkPrimary : colors.text.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="Home"
        component={TabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Machines"
        component={MachinesScreen}
        options={{ title: 'Machines' }}
      />
      <Stack.Screen
        name="Projects"
        component={ProjectsScreen}
        options={({ route }) => ({
          title: (route.params as ProjectsScreenParams)?.machineName || 'Projects',
        })}
      />
      <Stack.Screen
        name="Workspace"
        component={WorkspaceScreen}
        options={({ route }) => ({
          title: (route.params as ProjectsScreenParams)?.projectName || 'Workspace',
        })}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({
          title: (route.params as ChatScreenParams)?.projectName || 'Chat',
        })}
      />
      <Stack.Screen
        name="FileBrowser"
        component={FileBrowserScreen}
        options={{ title: 'Files' }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Stack.Navigator>
  );
}

// Export types for use in screens
export type MainStackRouteProp<T extends keyof RootStackParamList> = RouteProp<RootStackParamList, T>;
