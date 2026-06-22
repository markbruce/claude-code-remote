/**
 * isAuthError 分类器测试
 */
import { isAuthError } from '../../src/errors';

describe('isAuthError', () => {
  const authCases: Array<[string, unknown]> = [
    ['HTTP 401', new Error('Request failed with status 401')],
    ['JWT expired', new Error('jwt expired')],
    ['invalid token', new Error('invalid token')],
    ['中文 授权', new Error('授权失败')],
    ['中文 认证失败', new Error('认证失败')],
    ['中文 无效的机器令牌', new Error('无效的机器令牌')],
    ['中文 机器不存在', new Error('机器不存在')],
    ['raw string auth', 'token is invalid'],
  ];

  const networkCases: Array<[string, unknown]> = [
    ['transport close', new Error('transport close')],
    ['ETIMEDOUT', new Error('connect ETIMEDOUT 10.0.0.1:3000')],
    ['ECONNREFUSED', new Error('connect ECONNREFUSED')],
    ['ping timeout', new Error('ping timeout')],
    ['websocket error', new Error('websocket error')],
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['plain object no message', { code: 'ECONNRESET' }],
  ];

  it.each(authCases)('returns true for auth error: %s', (_label, err) => {
    expect(isAuthError(err)).toBe(true);
  });

  it.each(networkCases)('returns false for non-auth error: %s', (_label, err) => {
    expect(isAuthError(err)).toBe(false);
  });
});
