export type AccessState = {
  authorized: boolean;
  completedResults?: number;
  workspaceReady?: boolean;
  boundUserId?: string;
  code?: string;
  error?: string;
  user?: {
    id: string;
    account: string;
    role: 'member' | 'super_admin';
    expires_at: number | null;
  };
};
export const accessMessages: Record<string, string> = {
  UNAUTHENTICATED: '请输入账号和密钥登录。',
  INVALID_CREDENTIALS: '账号或密钥不正确。',
  INVALID_INPUT: '请检查账号和密钥格式。',
  EXPIRED: '授权已到期，请联系管理员续期。',
  BANNED: '账号已被封禁，请联系管理员。',
  CONNECTION_FAILED: '无法连接授权服务，请检查网络后重试。',
  SERVICE_UNAVAILABLE: '授权服务暂时不可用，请稍后重试。',
  RATE_LIMITED: '登录尝试过于频繁，请一分钟后重试。',
  BUSY: '正在处理，请稍后重试。',
  SWITCH_RESTART_REQUIRED:
    '当前进程已绑定另一账号，请完成任务后重启软件再切换。',
  TASKS_ACTIVE: '仍有任务或导出进行中，请完成后再退出。',
  LEGACY_CLAIMED: '旧工作区已归属于其他账号，请选择新建空工作区。',
  LOGIN_CANCELLED: '已取消登录。',
};
