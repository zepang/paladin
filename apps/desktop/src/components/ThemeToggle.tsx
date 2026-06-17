import { useThemeStore } from '@/stores/theme';
import { Monitor, Moon, Sun } from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const labelMap: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  const Icon = iconMap[theme] ?? Monitor;
  const label = labelMap[theme] ?? 'System';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      title={`Theme: ${label}`}
    >
      <Icon className="size-4" />
    </button>
  );
}
