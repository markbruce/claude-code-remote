#!/usr/bin/env python3
"""Create Gitea issue for history message ordering fix. Uses token from git remote URL (same as git push)."""
from __future__ import annotations

import json
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def remote_url() -> str:
    return subprocess.check_output(
        ["git", "remote", "get-url", "origin"], text=True, cwd=REPO_ROOT
    ).strip()


def parse_token_and_host(url: str) -> tuple[str | None, str | None]:
    # https://user:token@host/path.git
    m = re.match(r"^https://([^:]+):([^@]+)@([^/]+)/", url)
    if not m:
        return None, None
    return m.group(2), m.group(3)


def main() -> int:
    url = remote_url()
    token, host = parse_token_and_host(url)
    if not token or not host:
        print("Could not parse token from git remote (expected https://user:token@host/...)", file=sys.stderr)
        return 1

    api = f"https://{host}/api/v1/repos/zhang_xiaoning/cc-remote/issues"
    title = "[已修复] 历史消息加载时工具与文字顺序错乱"
    body = """### 背景

历史会话加载后，工具调用与 assistant 文字块的展示顺序可能与真实对话/JSONL 中 content 块顺序不一致，常见表现为**工具稳定地排在同轮文字之前**。

### 根因摘要

1. 展开为 `HistoryMessage` 时大量使用 `Date.now()`，且第一轮建 Map 与第二轮展开对同一条消息可能得到不同毫秒，导致工具与文字时间戳不一致。
2. 前端 `loadHistoryMessages` / `loadMoreHistory` 按 `timestamp` 排序时，会放大上述偏置。
3. `extractToolResultsFromUserWithMap` 曾在仅命中 Map、未命中当前页 `result` 时 `push` tool_use，插入位置偏离 assistant 块顺序。

### 修复要点

1. **JSONL 直读**：`readSessionJsonlDirectly` 将行级 `timestamp` 挂到返回的 `SDKMessage` 上，供 `extractMessageTimestamp` 使用。
2. **块序**：`HistoryMessage` 增加可选 `order`；`extractAssistantBlocks` / `extractAssistantBlocksToMap` 按块顺序维护 `order`。
3. **Map 复用**：从全局 Map 取出 `tool_use` 时同步 `timestamp = msgTimestamp` 与 `order`，与同条 assistant 内文字块一致。
4. **user/tool_result**：仅更新 Map 中的 `toolResult`，不再向 `result` 插入 `tool_use`。
5. **前端**：`chatStore` 按 `(timestamp, order)` 复合排序。

### 相关提交

| 提交 | 说明 |
|------|------|
| `9ec3368` | 初版修复：order、复合排序、原始时间戳传递等（#18） |
| `9ccc01a` | 补全：JSONL 挂时间戳、Map 内 tool 同步 timestamp、移除错误 push |

### 涉及文件（主要）

- `packages/agent/src/sdk-session.ts`
- `packages/shared/src/types.ts`（`HistoryMessage.order`）
- `packages/web/src/stores/chatStore.ts`

### 残余与边界（已知）

- JSONL 不可读、回退 SDK 且消息无时间字段时，仍依赖 `Date.now()`；当前通过第二轮统一 `msgTimestamp` 与 Map 同步兜底。
- 分页场景下，若本页仅有 `tool_result` 而无对应 assistant 页，工具卡片可能仅在含 `tool_use` 的页展示（顺序正确，完整性另议）。

### 状态

**已在本仓库分支完成开发与提交**（见上表）；合并主分支后以实际 PR/Merge 记录为准。

---
*由仓库脚本 `scripts/create-gitea-issue-history-ordering.py` 自动创建，对应留档 `docs/records/gitea-issue-history-message-ordering.md`*
"""

    payload = json.dumps({"title": title, "body": body}).encode("utf-8")
    req = urllib.request.Request(
        api,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"token {token}",
        },
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err = e.read().decode(errors="replace")
        print(f"HTTP {e.code}: {err}", file=sys.stderr)
        return 1

    num = data.get("number")
    html = data.get("html_url") or data.get("url")
    print(f"Created issue #{num}: {html}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
