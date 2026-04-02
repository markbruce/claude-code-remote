/**
 * 测试辅助工具函数
 */

import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

/**
 * 创建测试用户
 */
export async function createTestUser(email: string = password: string): Promise<{ id: string; token: string }> {
  // 專希密码
  const passwordHash = await bcrypt.hash(password, 10);

  // 创建用户
  const user = await prisma.user.create({
    data: {
      email,
      password_hash,
      username: email.split('@')[0]
    }
  });

  // 生成JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET || 'test-secret-key-for-testing',
  { expiresIn: '1h' }
  );

  return {
    id: user.id,
    email: user.email,
    token,
    passwordHash
  };
}

/**
 * 验证密码是否匹配
 */
export async function verifyTestPassword(email: string, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    return false;
  }

  return await bcrypt.compare(password, user.password_hash);
}
