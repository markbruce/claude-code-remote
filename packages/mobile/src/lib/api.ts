/**
 * CC Remote - REST API Client
 * Provides functions for interacting with the CC Remote server API
 */

import type {
  User,
  LoginRequest,
  LoginResponse,
  Machine,
  Project,
} from 'cc-remote-shared';

/**
 * API response wrapper
 */
interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

/**
 * Login to the server
 * @param serverUrl - The base URL of the server (e.g., 'https://api.example.com')
 * @param username - User's email address
 * @param password - User's password
 * @returns LoginResponse containing token and user info
 * @throws Error if login fails
 */
export async function login(
  serverUrl: string,
  username: string,
  password: string,
): Promise<LoginResponse> {
  const url = `${serverUrl}/api/auth/login`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: username,
      password,
    } as LoginRequest),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(errorData.error || `Login failed: ${response.status}`);
  }

  return await response.json();
}

/**
 * Get the current user info using a token
 * @param serverUrl - The base URL of the server
 * @param token - Authentication token
 * @returns User info
 * @throws Error if request fails
 */
export async function getCurrentUser(
  serverUrl: string,
  token: string,
): Promise<User> {
  const response = await fetch(`${serverUrl}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get user: ${response.status}`);
  }

  return await response.json();
}

/**
 * Get list of machines for the authenticated user
 * @param serverUrl - The base URL of the server
 * @param token - Authentication token
 * @returns Array of machines
 * @throws Error if request fails
 */
export async function getMachines(
  serverUrl: string,
  token: string,
): Promise<Machine[]> {
  const response = await fetch(`${serverUrl}/api/machines`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get machines: ${response.status}`);
  }

  const data = await response.json();
  return data.machines || [];
}

/**
 * Get projects for a specific machine
 * @param serverUrl - The base URL of the server
 * @param machineId - The ID of the machine
 * @param token - Authentication token
 * @returns Array of projects
 * @throws Error if request fails
 */
export async function getProjects(
  serverUrl: string,
  machineId: string,
  token: string,
): Promise<Project[]> {
  const response = await fetch(`${serverUrl}/api/machines/${machineId}/projects`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get projects: ${response.status}`);
  }

  const data = await response.json();
  return data.projects || [];
}

/**
 * Get a single machine by ID
 * @param serverUrl - The base URL of the server
 * @param machineId - The ID of the machine
 * @param token - Authentication token
 * @returns Machine info
 * @throws Error if request fails
 */
export async function getMachine(
  serverUrl: string,
  machineId: string,
  token: string,
): Promise<Machine> {
  const response = await fetch(`${serverUrl}/api/machines/${machineId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get machine: ${response.status}`);
  }

  return await response.json();
}

/**
 * Bind a new machine to the user account
 * @param serverUrl - The base URL of the server
 * @param name - Display name for the machine
 * @param hostname - Machine hostname
 * @param token - Authentication token
 * @param machineToken - Optional machine token for binding
 * @returns BindMachineResponse with machine_id and machine_token
 * @throws Error if request fails
 */
export async function bindMachine(
  serverUrl: string,
  name: string,
  hostname: string,
  token: string,
  machineToken?: string,
): Promise<{ machine_id: string; machine_token: string }> {
  const response = await fetch(`${serverUrl}/api/machines/bind`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      hostname,
      machine_token: machineToken,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Bind failed' }));
    throw new Error(errorData.error || `Bind failed: ${response.status}`);
  }

  return await response.json();
}

/**
 * Helper function to make authenticated API requests
 * @param serverUrl - The base URL of the server
 * @param endpoint - API endpoint path
 * @param token - Authentication token
 * @param options - Fetch options (method, headers, body)
 * @returns Parsed JSON response
 */
export async function apiRequest<T>(
  serverUrl: string,
  endpoint: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${serverUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `Request failed: ${response.status}`);
  }

  return await response.json();
}
