/**
 * 诊断脚本：对比 SDK getSessionMessages 返回与原始 JSONL，
 * 判断 6 个 tool_result 丢失是 SDK 合并问题还是我们解析问题。
 *
 * 使用: node scripts/debug-session-messages.mjs
 * 或在 packages/agent 下: pnpm run debug-session
 */

import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SESSION_ID = '62a898c7-e8ed-4f0f-8c11-059ba43644bc';
const PROJECT_DIR = '/Users/zhangxiaoning';
const JSONL_PATH = path.join(
  process.env.HOME || '',
  '.claude/projects/-Users-zhangxiaoning',
  `${SESSION_ID}.jsonl`
);

function extractFromSdkMessage(msg) {
  const toolUseIds = new Set();
  const toolResultIds = new Set();
  const content = msg.message?.content;
  if (!content) return { toolUseIds, toolResultIds };
  const blocks = Array.isArray(content) ? content : [content];
  for (const block of blocks) {
    if (block?.type === 'tool_use' && block.id) toolUseIds.add(block.id);
    if (block?.type === 'tool_result' && block.tool_use_id) toolResultIds.add(block.tool_use_id);
  }
  return { toolUseIds, toolResultIds };
}

function sdkStats(messages) {
  const allToolUse = new Set();
  const allToolResult = new Set();
  for (const msg of messages) {
    const { toolUseIds, toolResultIds } = extractFromSdkMessage(msg);
    toolUseIds.forEach((id) => allToolUse.add(id));
    toolResultIds.forEach((id) => allToolResult.add(id));
  }
  return { allToolUse, allToolResult };
}

function fileStats(jsonlPath) {
  const allToolUse = new Set();
  const allToolResult = new Set();
  const raw = fs.readFileSync(jsonlPath, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed);
      if (row.type !== 'user' && row.type !== 'assistant') continue;
      const content = row.message?.content;
      if (!content) continue;
      const blocks = Array.isArray(content) ? content : [content];
      for (const block of blocks) {
        if (block?.type === 'tool_use' && block.id) allToolUse.add(block.id);
        if (block?.type === 'tool_result' && block.tool_use_id) allToolResult.add(block.tool_use_id);
      }
    } catch {
      // skip invalid lines
    }
  }
  return { allToolUse, allToolResult };
}

async function main() {
  console.log('=== 会话消息诊断 ===\n');
  console.log('SessionId:', SESSION_ID);
  console.log('ProjectDir:', PROJECT_DIR);
  console.log('JSONL path:', JSONL_PATH);
  console.log('');

  // 1. SDK 返回
  console.log('--- 1. SDK getSessionMessages 返回 ---');
  const messages = await getSessionMessages(SESSION_ID, { dir: PROJECT_DIR });
  const sdk = sdkStats(messages);
  console.log('SDK 返回消息条数:', messages.length);
  console.log('SDK 中 tool_use 数量:', sdk.allToolUse.size);
  console.log('SDK 中 tool_result 数量:', sdk.allToolResult.size);
  console.log('SDK tool_use IDs:', [...sdk.allToolUse].sort().join(', '));
  console.log('SDK tool_result IDs:', [...sdk.allToolResult].sort().join(', '));
  const sdkMissingResult = [...sdk.allToolUse].filter((id) => !sdk.allToolResult.has(id));
  console.log('SDK 中无 result 的 tool_use 数量:', sdkMissingResult.length);
  if (sdkMissingResult.length) console.log('   IDs:', sdkMissingResult.join(', '));
  console.log('');

  // 2. 原始 JSONL
  if (!fs.existsSync(JSONL_PATH)) {
    console.log('--- 2. 原始 JSONL ---');
    console.log('文件不存在:', JSONL_PATH);
    return;
  }
  console.log('--- 2. 原始 JSONL 统计 ---');
  const file = fileStats(JSONL_PATH);
  const lines = fs.readFileSync(JSONL_PATH, 'utf-8').split('\n').filter((l) => l.trim()).length;
  console.log('JSONL 总行数:', lines);
  console.log('文件中 tool_use 数量:', file.allToolUse.size);
  console.log('文件中 tool_result 数量:', file.allToolResult.size);
  const fileMissingResult = [...file.allToolUse].filter((id) => !file.allToolResult.has(id));
  console.log('文件中无 result 的 tool_use 数量:', fileMissingResult.length);
  if (fileMissingResult.length) console.log('   IDs:', fileMissingResult.join(', '));
  console.log('');

  // 3. 对比结论
  console.log('--- 3. 结论 ---');
  if (sdk.allToolResult.size < file.allToolResult.size) {
    const onlyInFile = [...file.allToolResult].filter((id) => !sdk.allToolResult.has(id));
    console.log('SDK 返回的 tool_result 比文件少 → 问题在 SDK 合并/返回逻辑');
    console.log('仅在文件中存在的 tool_result IDs:', onlyInFile.join(', '));
  } else if (sdk.allToolResult.size === file.allToolResult.size && sdkMissingResult.length > 0) {
    console.log('SDK 返回的 tool_result 数量与文件一致，但仍有 tool_use 未匹配 → 可能是我们解析顺序或匹配逻辑问题');
  } else if (sdkMissingResult.length === 0) {
    console.log('SDK 返回中所有 tool_use 都有对应 tool_result → 若 UI 仍显示缺失，问题在我们解析或前端');
  } else {
    console.log('SDK 中无 result 的 tool_use:', sdkMissingResult.length, '个');
    console.log('文件中无 result 的 tool_use:', fileMissingResult.length, '个');
    if (sdkMissingResult.length > fileMissingResult.length) {
      console.log('→ SDK 返回里缺失的 result 多于文件，说明是 SDK 合并导致丢失');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
