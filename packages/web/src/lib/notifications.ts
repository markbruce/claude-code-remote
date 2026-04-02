/**
 * 桌面通知工具
 * 参考 Happy Coder 的推送通知机制实现
 */

import i18n from '../i18n';

export type NotificationPermissionState = 'granted' | 'denied' | 'default';

/**
 * 请求通知权限
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!('Notification' in window)) {
    console.warn('[Notifications] This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission as NotificationPermissionState;
  }

  return Notification.permission as NotificationPermissionState;
}

/**
 * 检查通知权限状态
 */
export function getNotificationPermission(): NotificationPermissionState {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission as NotificationPermissionState;
}

/**
 * 显示 Agent 状态变更通知
 */
export function showAgentStatusNotification(
  machineName: string,
  status: 'online' | 'offline',
  reason?: string
): Notification | null {
  if (!('Notification' in window)) {
    return null;
  }

  if (Notification.permission !== 'granted') {
    return null;
  }

  const title = status === 'online'
    ? i18n.t('notifications.machineOnline', { machineName })
    : i18n.t('notifications.machineOffline', { machineName });

  const body = reason
    ? formatDisconnectReason(reason)
    : (status === 'online' ? i18n.t('notifications.canStartSession') : i18n.t('notifications.checkNetwork'));

  const notification = new Notification(title, {
    body,
    icon: '/favicon.ico',
    tag: `agent-status-${machineName}`,  // 相同 tag 会替换之前的通知
    requireInteraction: false,
  });

  // 3秒后自动关闭
  setTimeout(() => {
    notification.close();
  }, 3000);

  return notification;
}

/**
 * 显示权限请求通知
 */
export function showPermissionRequestNotification(
  machineName: string,
  toolName: string
): Notification | null {
  if (!('Notification' in window)) {
    return null;
  }

  if (Notification.permission !== 'granted') {
    return null;
  }

  const notification = new Notification(i18n.t('notifications.permissionTitle', { machineName }), {
    body: i18n.t('notifications.permissionBody', { toolName }),
    icon: '/favicon.ico',
    tag: `permission-request-${machineName}`,
    requireInteraction: true,  // 需要用户交互才能关闭
  });

  return notification;
}

/**
 * 显示任务完成通知
 */
export function showTaskCompleteNotification(
  machineName: string,
  summary: string
): Notification | null {
  if (!('Notification' in window)) {
    return null;
  }

  if (Notification.permission !== 'granted') {
    return null;
  }

  const notification = new Notification(i18n.t('notifications.taskCompleteTitle', { machineName }), {
    body: summary,
    icon: '/favicon.ico',
    tag: `task-complete-${machineName}`,
    requireInteraction: false,
  });

  // 5秒后自动关闭
  setTimeout(() => {
    notification.close();
  }, 5000);

  return notification;
}

/**
 * 格式化断开原因
 */
function formatDisconnectReason(reason: string): string {
  const reasonMap: Record<string, string> = {
    'client namespace disconnect': i18n.t('notifications.clientDisconnect'),
    'server namespace disconnect': i18n.t('notifications.serverDisconnect'),
    'ping timeout': i18n.t('notifications.pingTimeout'),
    'transport close': i18n.t('notifications.transportClose'),
    'transport error': i18n.t('notifications.transportError'),
    'io server disconnect': i18n.t('notifications.serverActiveDisconnect'),
    'io client disconnect': i18n.t('notifications.clientActiveDisconnect'),
  };

  return reasonMap[reason] || reason;
}
