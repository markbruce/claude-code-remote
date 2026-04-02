/**
 * Git 操作模块测试
 * 测试 agent 读取不同路径的 git 状态是否正常
 */

import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import { getGitStatus, getGitLog } from '../../src/git';

// Mock simple-git
jest.mock('simple-git');

const mockedSimpleGit = simpleGit as jest.MockedFunction<typeof simpleGit>;

describe('Git 模块', () => {
  let mockGit: jest.Mocked<SimpleGit>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGit = {
      checkIsRepo: jest.fn(),
      status: jest.fn(),
      log: jest.fn(),
    } as unknown as jest.Mocked<SimpleGit>;

    mockedSimpleGit.mockReturnValue(mockGit);
  });

  describe('getGitStatus', () => {
    it('应能成功读取 claude-code 仓库的 git 状态', async () => {
      // 模拟 simple-git 返回的 StatusResult
      const mockStatusResult: Partial<StatusResult> = {
        current: 'main',
        created: ['new-file.ts'],
        deleted: ['old-file.ts'],
        modified: ['src/bootstrap/state.ts', 'src/utils/teleport/api.ts'],
        renamed: [],
        not_added: ['.env.local'],
        ahead: 2,
        behind: 0,
        staged: ['new-file.ts', 'old-file.ts'],
      };

      mockGit.checkIsRepo.mockResolvedValue(true);
      mockGit.status.mockResolvedValue(mockStatusResult as StatusResult);

      const result = await getGitStatus({
        machine_id: 'test-machine',
        project_path: '/Users/zhangxiaoning/Projects/ai/claude-code',
        request_id: 'req-001',
      });

      // 验证 simpleGit 被正确调用
      expect(mockedSimpleGit).toHaveBeenCalledWith('/Users/zhangxiaoning/Projects/ai/claude-code');

      // 验证返回结果
      expect(result.request_id).toBe('req-001');
      expect(result.success).toBe(true);
      expect(result.status).toBeDefined();
      expect(result.status!.branch).toBe('main');
      expect(result.status!.ahead).toBe(2);
      expect(result.status!.behind).toBe(0);
      expect(result.status!.untracked).toEqual(['.env.local']);
    });

    it('当路径不是 Git 仓库时应返回错误', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false);

      const result = await getGitStatus({
        machine_id: 'test-machine',
        project_path: '/tmp/not-a-repo',
        request_id: 'req-002',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('不是 Git 仓库');
      expect(result.status).toBeUndefined();
    });

    it('当 simple-git 抛出异常时应捕获并返回错误', async () => {
      mockGit.checkIsRepo.mockRejectedValue(new Error('路径不存在'));

      const result = await getGitStatus({
        machine_id: 'test-machine',
        project_path: '/nonexistent/path',
        request_id: 'req-003',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('路径不存在');
    });

    it('当 current 分支为空时应使用 HEAD 作为默认值', async () => {
      const mockStatusResult: Partial<StatusResult> = {
        current: null,
        created: [],
        deleted: [],
        modified: [],
        renamed: [],
        not_added: [],
        ahead: 0,
        behind: 0,
        staged: [],
      };

      mockGit.checkIsRepo.mockResolvedValue(true);
      mockGit.status.mockResolvedValue(mockStatusResult as StatusResult);

      const result = await getGitStatus({
        machine_id: 'test-machine',
        project_path: '/Users/zhangxiaoning/Projects/ai/claude-code',
        request_id: 'req-004',
      });

      expect(result.success).toBe(true);
      expect(result.status!.branch).toBe('HEAD');
    });

    it('应正确解析 renamed 文件', async () => {
      const mockStatusResult: Partial<StatusResult> = {
        current: 'develop',
        created: [],
        deleted: [],
        modified: [],
        renamed: [{ from: 'old-name.ts', to: 'new-name.ts' }],
        not_added: [],
        ahead: 1,
        behind: 3,
        staged: [],
      };

      mockGit.checkIsRepo.mockResolvedValue(true);
      mockGit.status.mockResolvedValue(mockStatusResult as StatusResult);

      const result = await getGitStatus({
        machine_id: 'test-machine',
        project_path: '/Users/zhangxiaoning/Projects/ai/claude-code',
        request_id: 'req-005',
      });

      expect(result.success).toBe(true);
      expect(result.status!.staged).toContain('new-name.ts');
      expect(result.status!.ahead).toBe(1);
      expect(result.status!.behind).toBe(3);
    });

    it('应正确处理所有字段为空数组的情况', async () => {
      const mockStatusResult: Partial<StatusResult> = {
        current: 'clean-branch',
        created: [],
        deleted: [],
        modified: [],
        renamed: [],
        not_added: [],
        ahead: 0,
        behind: 0,
        staged: [],
      };

      mockGit.checkIsRepo.mockResolvedValue(true);
      mockGit.status.mockResolvedValue(mockStatusResult as StatusResult);

      const result = await getGitStatus({
        machine_id: 'test-machine',
        project_path: '/Users/zhangxiaoning/Projects/ai/claude-code',
        request_id: 'req-006',
      });

      expect(result.success).toBe(true);
      expect(result.status!.staged).toEqual([]);
      expect(result.status!.unstaged).toEqual([]);
      expect(result.status!.untracked).toEqual([]);
    });

    it('应正确处理非 Error 类型的异常', async () => {
      mockGit.checkIsRepo.mockRejectedValue('字符串错误');

      const result = await getGitStatus({
        machine_id: 'test-machine',
        project_path: '/Users/zhangxiaoning/Projects/ai/claude-code',
        request_id: 'req-007',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('获取 Git 状态失败');
    });

    it('当 untracked 文件超过 500 时应截断', async () => {
      // 生成 600 个未追踪文件，模拟 claude-code 大仓库的情况
      const manyNotAdded = Array.from({ length: 600 }, (_, i) => `node_modules/pkg${i}/index.js`);

      const mockStatusResult: Partial<StatusResult> = {
        current: 'main',
        created: [],
        deleted: [],
        modified: ['src/changed.ts'],
        renamed: [],
        not_added: manyNotAdded,
        ahead: 0,
        behind: 0,
        staged: [],
      };

      mockGit.checkIsRepo.mockResolvedValue(true);
      mockGit.status.mockResolvedValue(mockStatusResult as StatusResult);

      const result = await getGitStatus({
        machine_id: 'test-machine',
        project_path: '/Users/zhangxiaoning/Projects/ai/claude-code',
        request_id: 'req-truncate',
      });

      expect(result.success).toBe(true);
      expect(result.status!.untracked).toHaveLength(500);
      // 确认截断的是前 500 个
      expect(result.status!.untracked[0]).toBe('node_modules/pkg0/index.js');
      expect(result.status!.untracked[499]).toBe('node_modules/pkg499/index.js');
    });
  });

  describe('getGitLog', () => {
    it('应能成功读取 git 日志', async () => {
      const mockLogResult = {
        all: [
          {
            hash: 'abc1234567890def',
            message: 'feat: add new feature',
            author_name: 'Test User',
            date: '2024-01-01',
          },
          {
            hash: 'def4567890abc123',
            message: 'fix: fix bug',
            author_name: 'Another User',
            date: '2024-01-02',
          },
        ],
      };

      mockGit.checkIsRepo.mockResolvedValue(true);
      mockGit.log.mockResolvedValue(mockLogResult as any);

      const result = await getGitLog({
        machine_id: 'test-machine',
        project_path: '/Users/zhangxiaoning/Projects/ai/claude-code',
        request_id: 'log-001',
      });

      expect(result.success).toBe(true);
      expect(result.commits).toHaveLength(2);
      expect(result.commits![0].hash).toBe('abc1234');
    });
  });
});
