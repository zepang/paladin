import { useTerminalStore } from '@/stores/terminal';
import { useCallback, useEffect, useRef } from 'react';

// 可拖拽分隔条 — 调整底部面板高度，4px 分隔线, hover 显示手柄光标

export function ResizeHandle() {
  const setPanelHeight = useTerminalStore((s) => s.setPanelHeight);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    },
    [],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      // 面板高度 = 窗口高度 - 鼠标 Y 坐标
      const newHeight = window.innerHeight - e.clientY;
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setPanelHeight]);

  return (
    <div
      className="h-1 bg-gray-300 dark:bg-gray-600 hover:bg-blue-400 dark:hover:bg-blue-500 cursor-ns-resize transition-colors flex-shrink-0"
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="拖拽调整面板高度"
    />
  );
}
