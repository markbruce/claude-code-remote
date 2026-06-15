/**
 * 错误分类工具
 *
 * 区分认证类错误（token 失效 / 401 / 机器未注册）与网络类错误。
 * 认证类错误需要重新绑定；网络类错误只需继续重连。
 */

const AUTH_PATTERN = /401|jwt|token|授权|认证|令牌|机器不存在/i;

/**
 * 判断一个错误是否为认证类错误。
 *
 * 用于在重连失败时区分：
 * - 认证失败 → 触发重新绑定流程（清掉 machine_token）
 * - 网络失败 → 继续无限重连，绝不应让用户重新绑定
 */
export function isAuthError(error: unknown): boolean {
  if (error == null) return false;
  const message =
    (typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)) ?? '';
  return AUTH_PATTERN.test(message);
}
