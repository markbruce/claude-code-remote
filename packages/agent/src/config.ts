/**
 * @cc-remote/agent - 配置管理模块
 * 负责管理Agent的配置信息，包括machine_id、machine_token和server_url
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Agent配置接口
 */
export interface AgentConfig {
  /** 机器ID */
  machine_id: string;
  /** 机器Token（用于认证） */
  machine_token: string;
  /** 服务器URL */
  server_url: string;
  /** 机器名称 */
  machine_name?: string;
  /** 主机名 */
  hostname?: string;
  /** 最后连接时间 */
  last_connected?: string;
}

/**
 * 配置管理器类
 */
export class ConfigManager {
  private configDir: string;
  private configPath: string;
  private config: AgentConfig | null = null;

  constructor(configDir?: string) {
    // 配置目录: ~/.claude-agent/ 或自定义路径
    this.configDir = configDir || path.join(os.homedir(), '.claude-agent');
    this.configPath = path.join(this.configDir, 'config.json');
  }

  /**
   * 确保配置目录存在
   */
  private ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * 读取配置文件
   * @returns 配置对象，如果不存在则返回null
   */
  readConfig(): AgentConfig | null {
    try {
      if (!fs.existsSync(this.configPath)) {
        return null;
      }

      const content = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(content) as AgentConfig;
      return this.config;
    } catch (error) {
      console.error('读取配置文件失败:', error);
      return null;
    }
  }

  /**
   * 写入配置文件
   * @param config 配置对象
   */
  writeConfig(config: AgentConfig): void {
    try {
      this.ensureConfigDir();

      // 更新最后连接时间
      config.last_connected = new Date().toISOString();

      // 写入配置文件，设置权限为仅用户可读写
      const content = JSON.stringify(config, null, 2);
      fs.writeFileSync(this.configPath, content, { mode: 0o600 });

      this.config = config;
      console.log(`配置已保存到: ${this.configPath}`);
    } catch (error) {
      console.error('写入配置文件失败:', error);
      throw error;
    }
  }

  /**
   * 更新部分配置
   * @param partialConfig 部分配置对象
   */
  updateConfig(partialConfig: Partial<AgentConfig>): void {
    const currentConfig = this.readConfig() || {
      machine_id: '',
      machine_token: '',
      server_url: '',
    };

    const newConfig: AgentConfig = {
      ...currentConfig,
      ...partialConfig,
    };

    this.writeConfig(newConfig);
  }

  /**
   * 检查是否已绑定
   * @returns 如果配置存在且包含machine_id和machine_token则返回true
   */
  isBound(): boolean {
    const config = this.readConfig();
    return !!(config && config.machine_id && config.machine_token);
  }

  /**
   * 获取配置
   * @returns 配置对象
   */
  getConfig(): AgentConfig | null {
    return this.config || this.readConfig();
  }

  /**
   * 获取服务器URL
   * @param defaultUrl 默认URL
   * @returns 服务器URL
   */
  getServerUrl(defaultUrl: string = 'http://localhost:3000'): string {
    const config = this.getConfig();
    return config?.server_url || defaultUrl;
  }

  /**
   * 获取认证信息
   * @returns 认证信息对象，如果未绑定则返回null
   */
  getAuthInfo(): { machine_id: string; machine_token: string } | null {
    const config = this.getConfig();
    if (!config || !config.machine_id || !config.machine_token) {
      return null;
    }
    return {
      machine_id: config.machine_id,
      machine_token: config.machine_token,
    };
  }

  /**
   * 清除配置（解绑）
   */
  clearConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        fs.unlinkSync(this.configPath);
        console.log('配置已清除');
      }
      this.config = null;
    } catch (error) {
      console.error('清除配置失败:', error);
      throw error;
    }
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 获取主机名
   */
  getHostname(): string {
    return os.hostname();
  }

  /**
   * 获取机器信息
   */
  getMachineInfo(): { hostname: string; platform: string; arch: string } {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
    };
  }
}

// 导出单例实例
export const configManager = new ConfigManager();
