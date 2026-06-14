/**
 * 错误提示组件
 * 
 * 用于显示各类错误和警告信息，支持重试按钮
 */

interface ErrorToastProps {
  /** 错误消息 */
  message: string;
  /** 重试回调 */
  onRetry?: () => void;
  /** 提示类型 */
  type?: 'error' | 'warning' | 'info';
  /** 是否显示 */
  visible?: boolean;
}

/**
 * ErrorToast 组件
 * 
 * 显示固定在底部的浮动提示框
 */
export function ErrorToast({ 
  message, 
  onRetry, 
  type = 'error',
  visible = true 
}: ErrorToastProps) {
  if (!visible) return null;

  // 根据类型选择背景色
  const bgColors = {
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
  };

  // 根据类型选择图标
  const icons = {
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 ${bgColors[type]} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 animate-slide-up`}>
      <span className="text-lg">{icons[type]}</span>
      <span className="font-medium">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-sm font-medium transition-colors"
        >
          重试
        </button>
      )}
    </div>
  );
}