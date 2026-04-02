/**
 * @cc-remote/agent - 工程扫描模块
 * 负责扫描 ~/.claude/ 目录下的工程，读取元数据并缓存结果
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProjectInfo } from 'cc-remote-shared';

/**
 * 工程元数据接口
 */
export interface ProjectMetadata {
  /** 工程路径 */
  path: string;
  /** 工程名称 */
  name: string;
  /** 最后访问时间 */
  lastAccessed?: Date | null;
  /** 最后扫描时间 */
  lastScanned: Date;
  /** 是否是Git仓库 */
  isGitRepo?: boolean;
  /** 是否有package.json */
  hasPackageJson?: boolean;
  /** 是否有README */
  hasReadme?: boolean;
  /** 最近一次会话的最后修改时间（时间戳） */
  lastSessionTime?: number | null;
}

/**
 * 扫描选项
 */
export interface ScanOptions {
  /** 是否强制刷新缓存 */
  forceRefresh?: boolean;
  /** Claude目录路径 */
  claudeDir?: string;
}

/**
 * 工程扫描器类
 */
export class ProjectScanner {
  private claudeDir: string;
  private cachePath: string;
  private cache: Map<string, ProjectMetadata> = new Map();
  private lastScanTime: Date | null = null;

  constructor() {
    // Claude配置目录: ~/.claude/
    this.claudeDir = path.join(os.homedir(), '.claude');
    // 缓存文件路径
    this.cachePath = path.join(os.homedir(), '.claude-agent', 'projects-cache.json');
  }

  /**
   * 加载缓存
   */
  private loadCache(): void {
    try {
      if (fs.existsSync(this.cachePath)) {
        const content = fs.readFileSync(this.cachePath, 'utf-8');
        const data = JSON.parse(content);

        if (data.projects && Array.isArray(data.projects)) {
          this.cache.clear();
          for (const project of data.projects) {
            this.cache.set(project.path, {
              ...project,
              lastAccessed: project.lastAccessed ? new Date(project.lastAccessed) : null,
              lastScanned: new Date(project.lastScanned),
            });
          }
        }

        this.lastScanTime = data.lastScanTime ? new Date(data.lastScanTime) : null;
      }
    } catch (error) {
      console.error('加载工程缓存失败:', error);
      this.cache.clear();
    }
  }

  /**
   * 保存缓存
   */
  private saveCache(): void {
    try {
      const cacheDir = path.dirname(this.cachePath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
      }

      const data = {
        lastScanTime: this.lastScanTime?.toISOString() || null,
        projects: Array.from(this.cache.values()),
      };

      fs.writeFileSync(this.cachePath, JSON.stringify(data, null, 2), { mode: 0o600 });
    } catch (error) {
      console.error('保存工程缓存失败:', error);
    }
  }

  /**
   * 检查目录是否是有效的Claude工程
   * Claude工程通常包含 .claude 目录或特定的配置文件
   */
  private isValidClaudeProject(dirPath: string): boolean {
    try {
      // 检查是否存在 .claude 子目录（Claude Code的工作目录）
      const claudeSubDir = path.join(dirPath, '.claude');
      if (fs.existsSync(claudeSubDir) && fs.statSync(claudeSubDir).isDirectory()) {
        return true;
      }

      // 检查是否存在 CLAUDE.md 文件
      const claudeMd = path.join(dirPath, 'CLAUDE.md');
      if (fs.existsSync(claudeMd)) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * 获取工程元数据
   */
  private getProjectMetadata(projectPath: string): ProjectMetadata {
    const stat = fs.statSync(projectPath);
    const name = path.basename(projectPath);

    const metadata: ProjectMetadata = {
      path: projectPath,
      name,
      lastAccessed: stat.atime,
      lastScanned: new Date(),
    };

    // 检查是否是Git仓库
    try {
      metadata.isGitRepo = fs.existsSync(path.join(projectPath, '.git'));
    } catch {
      metadata.isGitRepo = false;
    }

    // 检查是否有package.json
    try {
      metadata.hasPackageJson = fs.existsSync(path.join(projectPath, 'package.json'));
    } catch {
      metadata.hasPackageJson = false;
    }

    // 检查是否有README
    try {
      const readmeFiles = ['README.md', 'README.txt', 'README'];
      metadata.hasReadme = readmeFiles.some(file =>
        fs.existsSync(path.join(projectPath, file))
      );
    } catch {
      metadata.hasReadme = false;
    }

    return metadata;
  }

  /**
   * 扫描Claude工程
   * @param options 扫描选项
   * @returns 工程列表
   */
  async scanProjects(options: ScanOptions = {}): Promise<ProjectInfo[]> {
    const { forceRefresh = false } = options;

    // 如果不是强制刷新，先尝试使用缓存
    if (!forceRefresh && this.cache.size === 0) {
      this.loadCache();
    }

    // 如果缓存有效（最近5分钟内扫描过），直接返回缓存
    if (!forceRefresh && this.lastScanTime) {
      const cacheAge = Date.now() - this.lastScanTime.getTime();
      if (cacheAge < 5 * 60 * 1000 && this.cache.size > 0) {
        console.log('使用缓存的工程列表');
        return this.convertCacheToProjectInfo();
      }
    }

    console.log('开始扫描Claude工程...');

    // 清空缓存准备重新扫描
    this.cache.clear();

    try {
      // 确保Claude目录存在
      if (!fs.existsSync(this.claudeDir)) {
        console.log('Claude目录不存在，创建目录');
        fs.mkdirSync(this.claudeDir, { recursive: true });
        return [];
      }

      // 读取Claude目录下的所有子目录
      const entries = fs.readdirSync(this.claudeDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // 跳过隐藏目录和特殊目录
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        const projectPath = path.join(this.claudeDir, entry.name);

        try {
          // 检查是否是有效的Claude工程
          if (this.isValidClaudeProject(projectPath)) {
            const metadata = this.getProjectMetadata(projectPath);
            this.cache.set(projectPath, metadata);
            console.log(`发现工程: ${metadata.name} (${projectPath})`);
          }
        } catch (error) {
          console.error(`扫描目录失败 ${projectPath}:`, error);
        }
      }

      // 同时扫描最近访问的项目（从 ~/.claude/projects.json 读取）
      await this.scanRecentProjects();

      // 更新所有工程的最后会话时间
      this.updateSessionTimes();

      // 更新扫描时间并保存缓存
      this.lastScanTime = new Date();
      this.saveCache();

      console.log(`扫描完成，共发现 ${this.cache.size} 个工程`);
      return this.convertCacheToProjectInfo();
    } catch (error) {
      console.error('扫描工程失败:', error);
      throw error;
    }
  }

  /**
   * 从 jsonl 文件中提取 cwd 字段获取真实项目路径
   * 参考 claude-picker 脚本的实现
   */
  private extractCwdFromJsonl(projectDir: string): string | null {
    try {
      const files = fs.readdirSync(projectDir);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

      // 遍历所有 jsonl 文件，找到包含 cwd 的记录
      for (const jsonlFile of jsonlFiles) {
        const filePath = path.join(projectDir, jsonlFile);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        // 遍历每一行查找 cwd 字段
        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const json = JSON.parse(line);
            if (json.cwd && typeof json.cwd === 'string') {
              return json.cwd;
            }
          } catch {
            // 如果不是有效 JSON，尝试用正则提取
            const match = line.match(/"cwd"\s*:\s*"([^"]+)"/);
            if (match) {
              return match[1];
            }
          }
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 扫描最近访问的项目
   * Claude Code 会在 ~/.claude/projects/ 目录中记录项目
   */
  private async scanRecentProjects(): Promise<void> {
    const projectsDir = path.join(this.claudeDir, 'projects');

    try {
      if (!fs.existsSync(projectsDir)) {
        return;
      }

      const entries = fs.readdirSync(projectsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const projectDir = path.join(projectsDir, entry.name);

        // 从 jsonl 文件中提取真实路径（参考 claude-picker）
        const projectPath = this.extractCwdFromJsonl(projectDir);

        if (!projectPath) {
          continue;
        }

        // 检查路径是否存在
        if (!fs.existsSync(projectPath)) {
          continue;
        }

        // 如果已经在缓存中，跳过
        if (this.cache.has(projectPath)) {
          continue;
        }

        try {
          // 检查是否是目录
          const stat = fs.statSync(projectPath);
          if (!stat.isDirectory()) {
            continue;
          }

          const metadata = this.getProjectMetadata(projectPath);
          this.cache.set(projectPath, metadata);
          console.log(`从projects目录发现工程: ${metadata.name} (${projectPath})`);
        } catch (error) {
          console.error(`处理项目路径失败 ${projectPath}:`, error);
        }
      }
    } catch (error) {
      console.error('读取projects目录失败:', error);
    }
  }

  /**
   * 更新所有缓存的工程的最后会话时间
   * 通过读取 ~/.claude/projects/ 目录下的 jsonl 文件获取
   */
  private updateSessionTimes(): void {
    const projectsDir = path.join(this.claudeDir, 'projects');

    try {
      if (!fs.existsSync(projectsDir)) {
        return;
      }

      const entries = fs.readdirSync(projectsDir, { withFileTypes: true });

      // 建立工程路径到最后会话时间的映射
      const sessionTimeMap = new Map<string, number>();

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const projectDir = path.join(projectsDir, entry.name);

        // 从 jsonl 文件中提取真实路径
        const projectPath = this.extractCwdFromJsonl(projectDir);
        if (!projectPath) continue;

        // 获取该目录下所有 jsonl 文件的最新修改时间
        try {
          const files = fs.readdirSync(projectDir);
          const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

          let lastModified = 0;
          for (const jsonlFile of jsonlFiles) {
            const filePath = path.join(projectDir, jsonlFile);
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs > lastModified) {
              lastModified = stat.mtimeMs;
            }
          }

          // 如果已有记录，取最大的时间
          const existing = sessionTimeMap.get(projectPath);
          if (!existing || lastModified > existing) {
            sessionTimeMap.set(projectPath, lastModified);
          }
        } catch {
          // 忽略错误
        }
      }

      // 更新缓存中工程的 lastSessionTime
      for (const [projectPath, lastSessionTime] of sessionTimeMap) {
        const metadata = this.cache.get(projectPath);
        if (metadata) {
          metadata.lastSessionTime = lastSessionTime;
        }
      }
    } catch (error) {
      console.error('更新会话时间失败:', error);
    }
  }

  /**
   * 将缓存转换为ProjectInfo数组
   */
  private convertCacheToProjectInfo(): ProjectInfo[] {
    return Array.from(this.cache.values()).map(metadata => ({
      path: metadata.path,
      name: metadata.name,
      last_accessed: metadata.lastAccessed,
      lastSessionTime: metadata.lastSessionTime,
    }));
  }

  /**
   * 获取缓存的工程列表
   */
  getCachedProjects(): ProjectInfo[] {
    if (this.cache.size === 0) {
      this.loadCache();
    }
    return this.convertCacheToProjectInfo();
  }

  /**
   * 根据路径获取工程信息
   */
  getProjectByPath(projectPath: string): ProjectMetadata | undefined {
    if (this.cache.size === 0) {
      this.loadCache();
    }
    return this.cache.get(projectPath);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.lastScanTime = null;
    if (fs.existsSync(this.cachePath)) {
      fs.unlinkSync(this.cachePath);
    }
  }
}

// 导出单例实例
export const projectScanner = new ProjectScanner();
