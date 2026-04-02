/**
 * Git 操作模块
 * 使用 simple-git 库处理 Git 状态、日志、暂存、提交等操作
 */

import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import {
  GitStatus,
  GitCommit,
  GitStatusRequest,
  GitLogRequest,
  GitStageRequest,
  GitUnstageRequest,
  GitCommitRequest,
  GitStatusResponse,
  GitLogResponse,
  GitOperationResponse,
} from 'cc-remote-shared';

// untracked 文件最大返回数量，避免响应体过大导致 socket 断连
const MAX_UNTRACKED_FILES = 500;

/**
 * 解析 Git 状态结果
 */
function parseGitStatus(statusResult: StatusResult, branch: string): GitStatus {
  const staged: string[] = [];
  const unstaged: string[] = [];

  // staged 文件 (已暂存)
  if (statusResult.created) staged.push(...statusResult.created);
  if (statusResult.deleted) staged.push(...statusResult.deleted);
  if (statusResult.modified) staged.push(...statusResult.modified);
  if (statusResult.renamed) staged.push(...statusResult.renamed.map((r) => r.to));

  // unstaged 文件 (已修改但未暂存) - 通过对比 staged 和 modified
  // simple-git 的 modified 包含所有已修改的文件
  // 我们需要区分哪些是已暂存的，哪些是未暂存的
  // 实际上 simple-git 的行为是:
  // - staged: 已经 git add 的文件
  // - modified: 工作区已修改的文件 (可能部分已暂存)

  // 更精确的方式是通过 git diff --name-only 获取
  // 这里简化处理：modified 中的文件如果也在 staged 中，就不再添加到 unstaged
  const stagedSet = new Set(staged);
  for (const file of statusResult.modified || []) {
    if (!stagedSet.has(file)) {
      unstaged.push(file);
    }
  }

  return {
    branch: branch || statusResult.current || 'unknown',
    staged,
    unstaged,
    untracked: (statusResult.not_added || []).slice(0, MAX_UNTRACKED_FILES),
    ahead: statusResult.ahead || 0,
    behind: statusResult.behind || 0,
  };
}

/**
 * 获取 Git 状态
 */
export async function getGitStatus(data: GitStatusRequest): Promise<GitStatusResponse> {
  const git: SimpleGit = simpleGit(data.project_path);

  try {
    // 检查是否是 Git 仓库
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return {
        request_id: data.request_id,
        success: false,
        error: '不是 Git 仓库',
      };
    }

    // 获取状态
    const status = await git.status();
    const branch = status.current || 'HEAD';

    const gitStatus = parseGitStatus(status, branch);

    return {
      request_id: data.request_id,
      success: true,
      status: gitStatus,
    };
  } catch (error) {
    console.error('[Git] Status error:', error);
    return {
      request_id: data.request_id,
      success: false,
      error: error instanceof Error ? error.message : '获取 Git 状态失败',
    };
  }
}

/**
 * 获取 Git 提交日志
 */
export async function getGitLog(data: GitLogRequest): Promise<GitLogResponse> {
  const git: SimpleGit = simpleGit(data.project_path);
  const limit = data.limit || 20;

  try {
    // 检查是否是 Git 仓库
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return {
        request_id: data.request_id,
        success: false,
        error: '不是 Git 仓库',
      };
    }

    // 获取日志
    const log = await git.log(['--no-merges', `-${limit}`]);

    const commits: GitCommit[] = log.all.map((commit) => ({
      hash: commit.hash.substring(0, 7),
      message: commit.message,
      author: commit.author_name || 'Unknown',
      date: commit.date,
    }));

    return {
      request_id: data.request_id,
      success: true,
      commits,
    };
  } catch (error) {
    console.error('[Git] Log error:', error);
    return {
      request_id: data.request_id,
      success: false,
      error: error instanceof Error ? error.message : '获取 Git 日志失败',
    };
  }
}

/**
 * 暂存文件
 */
export async function stageFile(data: GitStageRequest): Promise<GitOperationResponse> {
  const git: SimpleGit = simpleGit(data.project_path);

  try {
    // 检查是否是 Git 仓库
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return {
        request_id: data.request_id,
        success: false,
        error: '不是 Git 仓库',
      };
    }

    // 暂存文件
    if (data.file === '.') {
      // 暂存所有文件
      await git.add('.');
    } else {
      await git.add(data.file);
    }

    return {
      request_id: data.request_id,
      success: true,
    };
  } catch (error) {
    console.error('[Git] Stage error:', error);
    return {
      request_id: data.request_id,
      success: false,
      error: error instanceof Error ? error.message : '暂存文件失败',
    };
  }
}

/**
 * 取消暂存文件
 */
export async function unstageFile(data: GitUnstageRequest): Promise<GitOperationResponse> {
  const git: SimpleGit = simpleGit(data.project_path);

  try {
    // 检查是否是 Git 仓库
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return {
        request_id: data.request_id,
        success: false,
        error: '不是 Git 仓库',
      };
    }

    // 取消暂存文件 (git restore --staged 或 git reset HEAD)
    // 使用 reset 的方式更兼容
    await git.reset(['HEAD', '--', data.file]);

    return {
      request_id: data.request_id,
      success: true,
    };
  } catch (error) {
    console.error('[Git] Unstage error:', error);
    return {
      request_id: data.request_id,
      success: false,
      error: error instanceof Error ? error.message : '取消暂存失败',
    };
  }
}

/**
 * 提交更改
 */
export async function commitChanges(data: GitCommitRequest): Promise<GitOperationResponse> {
  const git: SimpleGit = simpleGit(data.project_path);

  try {
    // 检查是否是 Git 仓库
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return {
        request_id: data.request_id,
        success: false,
        error: '不是 Git 仓库',
      };
    }

    // 检查是否有已暂存的更改
    const status = await git.status();
    if (status.staged.length === 0) {
      return {
        request_id: data.request_id,
        success: false,
        error: '没有已暂存的更改可以提交',
      };
    }

    // 提交
    await git.commit(data.message);

    return {
      request_id: data.request_id,
      success: true,
    };
  } catch (error) {
    console.error('[Git] Commit error:', error);
    return {
      request_id: data.request_id,
      success: false,
      error: error instanceof Error ? error.message : '提交失败',
    };
  }
}
