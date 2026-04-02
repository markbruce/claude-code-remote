/**
 * CC Remote - Navigation Type Definitions
 */

import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

// Screen parameters for each route
export interface HomeScreenParams {
  machineId?: string;
}

export interface MachinesScreenParams {
  showAddModal?: boolean;
}

export interface ProjectsScreenParams {
  machineId: string;
  machineName: string;
}

export interface ChatScreenParams {
  sessionId: string;
  projectId: string;
  projectName: string;
  machineId: string;
}

export interface FileBrowserScreenParams {
  projectId: string;
  projectName: string;
  machineId: string;
  initialPath?: string;
}

export interface SettingsScreenParams {
  showLogout?: boolean;
}

export interface WorkspaceScreenParams {
  sessionId: string;
  projectId: string;
  projectName: string;
  machineId: string;
}

// Auth stack param list (for unauthenticated flow)
export type AuthStackParamList = {
  Login: undefined;
};

// Main stack param list (for authenticated flow - includes Workspace)
export type MainStackParamList = {
  Machines: NavigatorScreenParams<MachinesScreenParams>;
  Projects: NavigatorScreenParams<ProjectsScreenParams>;
  Workspace: NavigatorScreenParams<WorkspaceScreenParams>;
  Settings: NavigatorScreenParams<SettingsScreenParams>;
};

// Root stack param list
export type RootStackParamList = {
  Home: NavigatorScreenParams<HomeScreenParams>;
  Machines: NavigatorScreenParams<MachinesScreenParams>;
  Projects: NavigatorScreenParams<ProjectsScreenParams>;
  Workspace: NavigatorScreenParams<WorkspaceScreenParams>;
  Chat: NavigatorScreenParams<ChatScreenParams>;
  FileBrowser: NavigatorScreenParams<FileBrowserScreenParams>;
  Settings: NavigatorScreenParams<SettingsScreenParams>;
};

// Tab param list (for bottom navigation)
export type TabParamList = {
  HomeTab: undefined;
  MachinesTab: undefined;
  ProjectsTab: undefined;
  SettingsTab: undefined;
};

// Common navigation options type
export type ScreenOptions = NativeStackNavigationOptions;
