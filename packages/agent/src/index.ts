#!/usr/bin/env node

/**
 * @cc-remote/agent - CLI入口
 * Claude Code Remote Agent命令行工具
 *
 * 智能模式:
 *   cc-agent           - 检查绑定状态，未绑定则进入交互式绑定，然后自动连接
 *   cc-agent --rebind  - 强制重新绑定
 *   cc-agent --status  - 仅显示状态
 */

import * as fs from 'fs';
import * as path from 'path';

// 动态读取 package.json 版本号（dist/../package.json）
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
const agentVersion: string = pkg.version;

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import * as os from 'os';
import * as http from 'http';
import * as https from 'https';

// 导入模块
import { ConfigManager, AgentConfig } from './config';
import { projectScanner } from './scanner';
import { createAgentClient, AgentClient } from './client';

// 配置管理器实例（根据 --config-dir 参数创建）
let configManager: ConfigManager;

// API路径
const API_PATHS = {
  LOGIN: '/api/auth/login',
  BIND_MACHINE: '/api/machines/bind',
};

// 连接配置
const CONNECTION_CONFIG = {
  maxRetries: 3,
  retryDelay: 5000,
  retryBackoff: 1.5,
};

/**
 * 通用API调用函数
 */
async function callAPI<T>(
  serverUrl: string,
  path: string,
  method: string,
  data?: any,
  token?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const client = url.protocol === 'https:' ? https : http;

    const requestData = data ? JSON.stringify(data) : '';

    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json',
    };

    if (requestData) {
      headers['Content-Length'] = Buffer.byteLength(requestData);
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method,
      headers,
    };

    const req = client.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(response);
          } else {
            reject(new Error(response.message || response.error || '请求失败'));
          }
        } catch (error) {
          reject(new Error('解析响应失败'));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (requestData) {
      req.write(requestData);
    }
    req.end();
  });
}

/**
 * 登录API - 使用邮箱和密码获取Token
 */
async function loginAPI(
  serverUrl: string,
  email: string,
  password: string
): Promise<{ token: string; user: { id: string; email: string; username: string | null } }> {
  return callAPI(serverUrl, API_PATHS.LOGIN, 'POST', { email, password });
}

/**
 * 绑定机器API
 */
async function bindMachineAPI(
  serverUrl: string,
  token: string,
  data: { name: string; hostname: string; force?: boolean }
): Promise<{ machine_id: string; machine_token: string }> {
  return callAPI(serverUrl, API_PATHS.BIND_MACHINE, 'POST', data, token);
}

/**
 * 睡眠函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 获取错误原因描述
 */
function getErrorReason(error: any): string {
  const message = error.message || String(error);

  if (message.includes('ECONNREFUSED')) return '无法连接服务器';
  if (message.includes('ETIMEDOUT')) return '连接超时';
  if (message.includes('ENOTFOUND')) return '服务器地址无法解析';
  if (message.includes('401')) return '认证失败，Token已失效';
  if (message.includes('404')) return '机器未在服务器注册';
  if (message.includes('JWT') || message.includes('token')) return 'Token无效或已过期';

  return message;
}

/**
 * 交互式绑定流程
 */
async function interactiveBind(serverUrl?: string): Promise<boolean> {
  console.log();
  console.log(chalk.blue('🚀 欢迎使用 Claude Code Remote Agent'));
  console.log(chalk.gray('首次运行，需要进行绑定配置'));
  console.log();

  try {
    // 1. 输入服务器地址
    let finalServerUrl: string = serverUrl || '';
    if (!finalServerUrl) {
      const serverAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'server',
          message: '服务器地址:',
          default: 'http://localhost:3000',
          validate: (input) => {
            if (!input) return '请输入服务器地址';
            if (!input.startsWith('http://') && !input.startsWith('https://')) {
              return '地址必须以 http:// 或 https:// 开头';
            }
            return true;
          },
        },
      ]);
      finalServerUrl = serverAnswer.server;
    }

    // 2. 输入邮箱
    const emailAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: '登录邮箱:',
        validate: (input) => {
          if (!input) return '请输入邮箱';
          if (!input.includes('@')) return '请输入有效的邮箱地址';
          return true;
        },
      },
    ]);

    // 3. 输入密码
    const passwordAnswer = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: '登录密码:',
        mask: '*',
        validate: (input) => {
          if (!input) return '请输入密码';
          if (input.length < 6) return '密码至少6个字符';
          return true;
        },
      },
    ]);

    // 4. 输入机器名称
    const hostname = os.hostname();
    const nameAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: '本机名称:',
        default: hostname,
      },
    ]);

    // 5. 登录获取Token
    let loginSpinner = ora('正在登录...').start();
    let token: string;

    try {
      const loginResult = await loginAPI(finalServerUrl, emailAnswer.email, passwordAnswer.password);
      token = loginResult.token;
      loginSpinner.succeed(chalk.green('登录成功'));
    } catch (error: any) {
      loginSpinner.fail(chalk.red('登录失败'));
      console.log(chalk.red(error.message));

      // 询问是否重试
      const { retry } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'retry',
          message: '是否重新输入邮箱和密码？',
          default: true,
        },
      ]);

      if (retry) {
        // 递归重试，但保留服务器地址
        return interactiveBind(finalServerUrl);
      }
      return false;
    }

    // 6. 绑定机器
    let bindSpinner = ora('正在绑定机器...').start();

    try {
      const bindResult = await bindMachineAPI(finalServerUrl, token, {
        name: nameAnswer.name,
        hostname: hostname,
      });

      // 保存配置
      const config: AgentConfig = {
        machine_id: bindResult.machine_id,
        machine_token: bindResult.machine_token,
        server_url: finalServerUrl,
        machine_name: nameAnswer.name,
        hostname: hostname,
      };

      configManager.writeConfig(config);

      bindSpinner.succeed(chalk.green('绑定成功!'));
      console.log(chalk.gray(`  机器ID: ${bindResult.machine_id}`));
      console.log(chalk.gray(`  配置文件: ${configManager.getConfigPath()}`));

      return true;
    } catch (error: any) {
      const errorMsg = error.message || '';

      // 如果是主机名已被绑定的错误，询问是否强制重新绑定
      if (errorMsg.includes('已被绑定') || errorMsg.includes('already bound')) {
        bindSpinner.fail(chalk.yellow('主机名已被绑定'));

        const { forceRebind } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'forceRebind',
            message: '是否强制重新绑定？这将覆盖之前的绑定记录。',
            default: true,
          },
        ]);

        if (forceRebind) {
          bindSpinner = ora('正在强制重新绑定...').start();
          try {
            const bindResult = await bindMachineAPI(finalServerUrl, token, {
              name: nameAnswer.name,
              hostname: hostname,
              force: true,
            });

            const config: AgentConfig = {
              machine_id: bindResult.machine_id,
              machine_token: bindResult.machine_token,
              server_url: finalServerUrl,
              machine_name: nameAnswer.name,
              hostname: hostname,
            };

            configManager.writeConfig(config);

            bindSpinner.succeed(chalk.green('强制绑定成功!'));
            console.log(chalk.gray(`  机器ID: ${bindResult.machine_id}`));
            console.log(chalk.gray(`  配置文件: ${configManager.getConfigPath()}`));

            return true;
          } catch (forceError: any) {
            bindSpinner.fail(chalk.red('强制绑定失败'));
            console.log(chalk.red(forceError.message));
            return false;
          }
        }
        return false;
      }

      bindSpinner.fail(chalk.red('绑定失败'));
      console.log(chalk.red(error.message));
      return false;
    }
  } catch (error: any) {
    console.error(chalk.red('绑定过程出错:'), error.message);
    return false;
  }
}

/**
 * 连接并运行（带重试）
 */
async function connectWithRetry(client: AgentClient): Promise<boolean> {
  let attempt = 0;
  let delay = CONNECTION_CONFIG.retryDelay;

  while (attempt < CONNECTION_CONFIG.maxRetries) {
    attempt++;

    try {
      await client.connect();
      return true;
    } catch (error: any) {
      const reason = getErrorReason(error);

      if (attempt < CONNECTION_CONFIG.maxRetries) {
        console.log(chalk.yellow(`⚠️  连接失败 (${reason})，${delay / 1000}秒后重试 (${attempt}/${CONNECTION_CONFIG.maxRetries})...`));
        await sleep(delay);
        delay *= CONNECTION_CONFIG.retryBackoff;
      } else {
        // 全部失败
        console.log(chalk.red(`❌ 连接失败: ${reason}`));
        console.log();

        const { rebind } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'rebind',
            message: '是否重新绑定？',
            default: true,
          },
        ]);

        if (rebind) {
          configManager.clearConfig();
          return false; // 返回false让调用者重新走绑定流程
        }
        throw error;
      }
    }
  }

  return false;
}

/**
 * 智能模式 - 主入口
 */
async function smartMode(options: { rebind?: boolean; force?: boolean; nonInteractive?: boolean; server?: string; email?: string; password?: string; name?: string }) {
  // 强制重新绑定
  if (options.rebind) {
    if (configManager.isBound()) {
      configManager.clearConfig();
      console.log(chalk.yellow('已清除旧的绑定信息'));
    }
  }

  // 检查绑定状态
  if (!configManager.isBound()) {
    // 非交互模式
    if (options.nonInteractive) {
      if (!options.server || !options.email || !options.password) {
        console.error(chalk.red('非交互模式需要提供 --server, --email, --password 参数'));
        process.exit(1);
      }

      const spinner = ora('正在登录...').start();
      try {
        const loginResult = await loginAPI(options.server, options.email, options.password);
        spinner.text = '正在绑定机器...';

        const bindResult = await bindMachineAPI(options.server, loginResult.token, {
          name: options.name || os.hostname(),
          hostname: os.hostname(),
          force: options.force,
        });

        const config: AgentConfig = {
          machine_id: bindResult.machine_id,
          machine_token: bindResult.machine_token,
          server_url: options.server,
          machine_name: options.name || os.hostname(),
          hostname: os.hostname(),
        };

        configManager.writeConfig(config);
        spinner.succeed(chalk.green('绑定成功!'));
      } catch (error: any) {
        spinner.fail(chalk.red('绑定失败'));
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    } else {
      // 交互式绑定
      const success = await interactiveBind(options.server);
      if (!success) {
        process.exit(1);
      }
    }
  }

  // 显示绑定信息
  const config = configManager.getConfig();
  console.log();
  console.log(chalk.blue('📡 Agent 启动中...'));
  console.log(chalk.gray(`  机器名称: ${config?.machine_name}`));
  console.log(chalk.gray(`  服务器: ${config?.server_url}`));
  console.log();

  // 连接服务器
  const serverUrl = options.server || config?.server_url || 'http://localhost:3000';
  const client = createAgentClient(serverUrl, configManager);

  // 设置事件监听
  client.on('connected', () => {
    console.log(chalk.green('✅ 已连接到服务器'));
    console.log(chalk.gray(`   Socket ID: ${client.getSocketId()}`));
  });

  client.on('disconnected', (reason) => {
    console.log(chalk.yellow(`⚠️  连接断开: ${reason}`));
  });

  client.on('reconnecting', (attempt) => {
    if (attempt === 1) {
      console.log(chalk.yellow('🔄 正在重连...'));
    }
  });

  client.on('reconnect_failed', async () => {
    console.log(chalk.red('❌ 重连失败'));

    const { rebind } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'rebind',
        message: '是否重新绑定？',
        default: true,
      },
    ]);

    if (rebind) {
      configManager.clearConfig();
      // 重新进入绑定流程
      await smartMode({ rebind: true });
    } else {
      process.exit(1);
    }
  });

  client.on('error', (error) => {
    console.log(chalk.red(`❌ 服务器错误: ${error}`));
  });

  // 处理进程信号
  process.on('SIGINT', async () => {
    console.log();
    console.log(chalk.yellow('正在关闭Agent...'));
    await client.disconnect();
    console.log(chalk.green('✅ Agent已关闭'));
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log(chalk.yellow('收到终止信号，正在关闭...'));
    await client.disconnect();
    process.exit(0);
  });

  // 连接（带重试）
  const spinner = ora('正在连接服务器...').start();

  try {
    const connected = await connectWithRetry(client);

    if (!connected) {
      // 需要重新绑定
      spinner.stop();
      await smartMode({ rebind: true });
      return;
    }

    spinner.succeed(chalk.green('Agent已启动并连接到服务器'));
    console.log();
    console.log(chalk.cyan('按 Ctrl+C 停止Agent'));

    // 保持进程运行
    process.stdin.resume();
  } catch (error: any) {
    spinner.fail(chalk.red('连接失败'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

// CLI程序配置
program
  .name('cc-agent')
  .description('Claude Code Remote Agent - PC守护进程')
  .version(agentVersion);

// 默认命令：智能模式
program
  .option('--rebind', '强制重新绑定')
  .option('--force', '强制覆盖已存在的主机名绑定')
  .option('--non-interactive', '非交互模式')
  .option('-s, --server <url>', '服务器地址')
  .option('-e, --email <email>', '登录邮箱')
  .option('-p, --password <password>', '登录密码')
  .option('-n, --name <name>', '机器名称')
  .option('--config-dir <path>', '配置目录路径（默认 ~/.claude-agent/）')
  .option('--status', '仅显示状态，不连接')
  .option('--unbind', '解除绑定')
  .action(async (options) => {
    // 仅显示状态
    if (options.status) {
      showStatus();
      return;
    }

    // 解除绑定
    if (options.unbind) {
      await doUnbind();
      return;
    }

    // 智能模式
    await smartMode(options);
  });

/**
 * 显示状态
 */
function showStatus() {
  console.log(chalk.blue('📊 Agent 状态'));
  console.log();

  if (!configManager.isBound()) {
    console.log(chalk.yellow('状态: 未绑定'));
    console.log(chalk.gray('运行 cc-agent 进行绑定'));
    return;
  }

  const config = configManager.getConfig();
  console.log(chalk.green('状态: 已绑定'));
  console.log(chalk.gray(`  机器ID: ${config?.machine_id}`));
  console.log(chalk.gray(`  机器名称: ${config?.machine_name || '未设置'}`));
  console.log(chalk.gray(`  主机名: ${config?.hostname || os.hostname()}`));
  console.log(chalk.gray(`  服务器: ${config?.server_url}`));
  console.log(chalk.gray(`  最后连接: ${config?.last_connected || '从未连接'}`));
  console.log();
  console.log(chalk.gray(`配置文件: ${configManager.getConfigPath()}`));
}

/**
 * 解除绑定
 */
async function doUnbind() {
  if (!configManager.isBound()) {
    console.log(chalk.yellow('机器未绑定'));
    return;
  }

  const config = configManager.getConfig();
  console.log(chalk.yellow('当前绑定信息:'));
  console.log(chalk.gray(`  机器ID: ${config?.machine_id}`));
  console.log(chalk.gray(`  机器名称: ${config?.machine_name}`));
  console.log();

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: '确定要解除绑定吗？',
      default: false,
    },
  ]);

  if (confirm) {
    configManager.clearConfig();
    console.log(chalk.green('✅ 绑定已解除'));
  } else {
    console.log(chalk.gray('操作已取消'));
  }
}

// 保留原有子命令（向后兼容）

/**
 * bind命令：绑定机器（兼容旧版）
 */
program
  .command('bind')
  .description('绑定本机到用户账户')
  .option('-t, --token <token>', '用户JWT token')
  .option('-n, --name <name>', '机器名称')
  .option('-s, --server <url>', '服务器地址', 'http://localhost:3000')
  .action(async (options) => {
    console.log(chalk.yellow('提示: 建议直接运行 cc-agent 进入智能模式'));
    console.log();

    try {
      if (configManager.isBound()) {
        const config = configManager.getConfig();
        console.log(chalk.yellow('机器已绑定:'));
        console.log(chalk.gray(`  机器ID: ${config?.machine_id}`));

        const { rebind } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'rebind',
            message: '是否重新绑定？',
            default: false,
          },
        ]);

        if (!rebind) {
          console.log(chalk.gray('绑定已取消'));
          return;
        }
        configManager.clearConfig();
      }

      let token = options.token;
      if (!token) {
        const answer = await inquirer.prompt([
          {
            type: 'password',
            name: 'token',
            message: '请输入JWT Token:',
            mask: '*',
            validate: (input) => input.length > 0 || 'Token不能为空',
          },
        ]);
        token = answer.token;
      }

      let machineName = options.name;
      if (!machineName) {
        const hostname = os.hostname();
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: '机器名称:',
            default: hostname,
          },
        ]);
        machineName = answer.name;
      }

      const spinner = ora('正在绑定机器...').start();

      try {
        const result = await bindMachineAPI(options.server, token, {
          name: machineName,
          hostname: os.hostname(),
        });

        const config: AgentConfig = {
          machine_id: result.machine_id,
          machine_token: result.machine_token,
          server_url: options.server,
          machine_name: machineName,
          hostname: os.hostname(),
        };

        configManager.writeConfig(config);

        spinner.succeed(chalk.green('绑定成功!'));
        console.log(chalk.gray(`  机器ID: ${result.machine_id}`));
        console.log();
        console.log(chalk.cyan('现在可以运行 cc-agent 启动Agent'));
      } catch (error: any) {
        spinner.fail(chalk.red('绑定失败'));
        console.error(chalk.red(error.message || error));
        process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.red('发生错误:'), error.message || error);
      process.exit(1);
    }
  });

/**
 * start命令：启动守护进程（兼容旧版）
 */
program
  .command('start')
  .description('启动守护进程')
  .option('-s, --server <url>', '服务器地址')
  .option('-d, --daemon', '以守护进程模式运行', false)
  .action(async (options) => {
    console.log(chalk.yellow('提示: 建议直接运行 cc-agent 进入智能模式'));
    await smartMode({ server: options.server });
  });

/**
 * status命令：查看状态
 */
program
  .command('status')
  .description('查看Agent状态')
  .action(() => {
    showStatus();
  });

/**
 * projects命令：列出工程
 */
program
  .command('projects')
  .description('扫描并列出Claude工程')
  .option('-f, --force', '强制刷新缓存')
  .action(async (options) => {
    console.log(chalk.blue('扫描Claude工程...'));
    console.log();

    const spinner = ora('正在扫描...').start();

    try {
      const projects = await projectScanner.scanProjects({
        forceRefresh: options.force,
      });

      spinner.succeed(chalk.green(`发现 ${projects.length} 个工程`));
      console.log();

      if (projects.length === 0) {
        console.log(chalk.gray('未发现Claude工程'));
        console.log(chalk.gray('确保您已在 ~/.claude/ 目录下使用过Claude Code'));
        return;
      }

      for (const project of projects) {
        console.log(chalk.white(`  ${project.name}`));
        console.log(chalk.gray(`    路径: ${project.path}`));
        if (project.last_accessed) {
          console.log(chalk.gray(`    最后访问: ${new Date(project.last_accessed).toLocaleString()}`));
        }
        console.log();
      }
    } catch (error: any) {
      spinner.fail(chalk.red('扫描失败'));
      console.error(chalk.red(error.message || error));
      process.exit(1);
    }
  });

/**
 * unbind命令：解除绑定
 */
program
  .command('unbind')
  .description('解除机器绑定')
  .action(async () => {
    await doUnbind();
  });

/**
 * install-service命令：安装为系统服务
 */
program
  .command('install-service')
  .description('安装为系统服务（开机自启）')
  .option('-s, --server <url>', '服务器地址')
  .action(async (options) => {
    console.log(chalk.blue('安装系统服务...'));
    console.log();

    const platform = os.platform();
    const serverUrl = options.server || configManager.getServerUrl();

    if (platform === 'darwin') {
      console.log(chalk.cyan('macOS 系统'));
      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cc-remote.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/cc-agent</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/cc-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/cc-agent-error.log</string>
</dict>
</plist>`;

      const plistPath = `${os.homedir()}/Library/LaunchAgents/com.cc-remote.agent.plist`;
      console.log(chalk.cyan('请手动执行以下命令:'));
      console.log(chalk.white(`  cat > "${plistPath}" << 'EOF'`));
      console.log(plistContent);
      console.log(chalk.white(`  EOF`));
      console.log(chalk.white(`  launchctl load "${plistPath}"`));

    } else if (platform === 'linux') {
      console.log(chalk.cyan('Linux 系统'));
      const serviceContent = `[Unit]
Description=Claude Code Remote Agent
After=network.target

[Service]
Type=simple
User=${os.userInfo().username}
ExecStart=/usr/local/bin/cc-agent
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target`;

      const servicePath = '/etc/systemd/system/cc-remote-agent.service';
      console.log(chalk.cyan('请手动执行以下命令 (需要root权限):'));
      console.log(chalk.white(`  sudo tee "${servicePath}" << 'EOF'`));
      console.log(serviceContent);
      console.log(chalk.white(`  EOF`));
      console.log(chalk.white(`  sudo systemctl daemon-reload`));
      console.log(chalk.white(`  sudo systemctl enable --now cc-remote-agent`));

    } else if (platform === 'win32') {
      console.log(chalk.cyan('Windows 系统'));
      console.log(chalk.yellow('Windows需要使用NSSM等工具安装服务'));
    }
  });

// 解析命令行参数前，初始化 configManager
program.hook('preAction', () => {
  const opts = program.opts();
  configManager = new ConfigManager(opts.configDir);
});

// 解析命令行参数
program.parse();
