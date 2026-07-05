/**
 * Titlebar 拖拽功能测试 — TDD RED phase
 *
 * 验证 Titlebar: 仅左键 drag-region 触发 startDragging(), 非左键/非drag区域不触发
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

const mockStartDragging = vi.fn().mockResolvedValue(undefined);
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({ startDragging: mockStartDragging }),
}));

vi.mock('@/stores/window', () => ({
  useWindowStore: () => ({ minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() }),
}));

vi.mock('../ChatToggle', () => ({
  ChatToggle: ({ onClick }: { onClick: () => void }) => (
    <button data-testid="chat-toggle" onClick={onClick}>Chat</button>
  ),
}));

vi.mock('../ThemeToggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme</button>,
}));

import { Titlebar } from '../Titlebar';

const defaultProps = { onToggleChat: vi.fn(), onToggleTerminal: vi.fn(), onToggleDiff: vi.fn() };

describe('Titlebar', () => {
  beforeEach(() => { mockStartDragging.mockClear(); });
  afterEach(() => { cleanup(); });

  describe('drag region', () => {
    it('左键 (buttons=1) mousedown 触发 startDragging()', () => {
      const { container } = render(<Titlebar {...defaultProps} />);
      const dr = container.querySelector('[data-tauri-drag-region]');
      fireEvent.mouseDown(dr!, { buttons: 1 });
      expect(mockStartDragging).toHaveBeenCalledTimes(1);
    });

    it('右键 (buttons=2) mousedown 不触发 startDragging()', () => {
      const { container } = render(<Titlebar {...defaultProps} />);
      const dr = container.querySelector('[data-tauri-drag-region]');
      fireEvent.mouseDown(dr!, { buttons: 2 });
      expect(mockStartDragging).not.toHaveBeenCalled();
    });

    it('中键 (buttons=4) mousedown 不触发 startDragging()', () => {
      const { container } = render(<Titlebar {...defaultProps} />);
      const dr = container.querySelector('[data-tauri-drag-region]');
      fireEvent.mouseDown(dr!, { buttons: 4 });
      expect(mockStartDragging).not.toHaveBeenCalled();
    });
  });
});
