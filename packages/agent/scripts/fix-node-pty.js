/**
 * pnpm 安装 node-pty 时会丢失 prebuilds/spawn-helper 的执行权限，
 * 导致 macOS 上 posix_spawnp 调用失败。此脚本在 postinstall 阶段修复权限。
 */
const path = require('path');
const fs = require('fs');

try {
  const ptyDir = path.dirname(require.resolve('node-pty/package.json'));
  const prebuildsDir = path.join(ptyDir, 'prebuilds');

  if (!fs.existsSync(prebuildsDir)) {
    process.exit(0);
  }

  let fixed = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name === 'spawn-helper') {
        const stat = fs.statSync(fullPath);
        if (!(stat.mode & 0o111)) {
          fs.chmodSync(fullPath, 0o755);
          fixed++;
        }
      }
    }
  };

  walk(prebuildsDir);
  if (fixed > 0) {
    console.log(`[fix-node-pty] Fixed execute permission on ${fixed} spawn-helper binary(ies)`);
  }
} catch {
  // node-pty not installed yet or resolve failed — ignore
}
