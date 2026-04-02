/**
 * Agent测试环境设置
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 设置测试环境变量
process.env.NODE_ENV = 'test';

// 测试配置目录
const testConfigDir = path.join(os.tmpdir(), 'claude-agent-test-' + Date.now());

/**
 * 创建测试配置目录
 */
function setupTestConfig() {
  if (!fs.existsSync(testConfigDir)) {
    fs.mkdirSync(testConfigDir, { recursive: true });
  }
}

/**
 * 清理测试配置目录
 */
function teardownTestConfig() {
  if (fs.existsSync(testConfigDir)) {
    fs.rmSync(testConfigDir, { recursive: true, force: true });
  }
}

// 全局设置
beforeAll(() => {
  setupTestConfig();
});

// 全局清理
afterAll(() => {
  teardownTestConfig();
});

// 导出测试配置目录
export { testConfigDir };
