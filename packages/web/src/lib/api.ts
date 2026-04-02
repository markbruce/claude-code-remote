/**
 * HTTP API 客户端
 * 处理认证和REST API请求
 */

import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import type { LoginRequest, LoginResponse, RegisterRequest, User } from 'cc-remote-shared';
import i18n from '../i18n';

// API配置
interface ApiConfig {
  baseURL: string;
}

// API错误响应
interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

// API客户端类
class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(config: ApiConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 请求拦截器 - 添加认证头
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器 - 处理错误
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        const apiError: ApiError = {
          message: error.response?.data?.message || error.message || i18n.t('errors.requestFailed'),
          code: error.response?.data?.code,
          status: error.response?.status,
        };

        // 401错误 - 清除token
        if (error.response?.status === 401) {
          this.clearToken();
          // 触发全局登出事件
          window.dispatchEvent(new CustomEvent('auth:logout'));
        }

        return Promise.reject(apiError);
      }
    );

    // 从localStorage恢复token
    this.loadToken();
  }

  /**
   * 从localStorage加载token
   */
  private loadToken(): void {
    const stored = localStorage.getItem('auth_token');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.token && data.expiresAt > Date.now()) {
          this.token = data.token;
        } else {
          localStorage.removeItem('auth_token');
        }
      } catch {
        localStorage.removeItem('auth_token');
      }
    }
  }

  /**
   * 保存认证token
   */
  private saveToken(token: string): void {
    // 默认7天过期
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    localStorage.setItem('auth_token', JSON.stringify({ token, expiresAt }));
    this.token = token;
  }

  /**
   * 获取当前token
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * 设置token
   */
  setToken(token: string): void {
    this.saveToken(token);
  }

  /**
   * 清除token
   */
  clearToken(): void {
    this.token = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
  }

  // ==================== 认证API ====================

  /**
   * 用户登录
   */
  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/api/auth/login', data);
    this.saveToken(response.data.token);
    // 同时存储用户信息
    localStorage.setItem('user_info', JSON.stringify(response.data.user));
    return response.data;
  }

  /**
   * 用户注册
   */
  async register(data: RegisterRequest): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/api/auth/register', data);
    this.saveToken(response.data.token);
    localStorage.setItem('user_info', JSON.stringify(response.data.user));
    return response.data;
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(): Promise<User> {
    const response = await this.client.get<User>('/api/auth/me');
    localStorage.setItem('user_info', JSON.stringify(response.data));
    return response.data;
  }

  /**
   * 登出
   */
  logout(): void {
    this.clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

  /**
   * 检查是否已登录
   */
  isAuthenticated(): boolean {
    return !!this.token;
  }

  /**
   * 获取缓存的用户信息
   */
  getCachedUser(): User | null {
    const stored = localStorage.getItem('user_info');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  }

  // ==================== 通用请求方法 ====================

  /**
   * GET请求
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  /**
   * POST请求
   */
  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  /**
   * PUT请求
   */
  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  /**
   * DELETE请求
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}

// 获取API基础URL
const getBaseURL = (): string => {
  // 优先使用环境变量
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // 开发环境：使用空字符串（相对路径），让 Vite 代理处理
  if (import.meta.env.DEV) {
    return '';
  }
  // 生产环境使用相同域名
  return window.location.origin;
};

// 导出单例
export const apiClient = new ApiClient({
  baseURL: getBaseURL(),
});

// 导出类型
export type { ApiConfig, ApiError };
