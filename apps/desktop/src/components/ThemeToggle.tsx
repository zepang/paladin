import { useThemeStore } from '@/stores/theme';
import { Button } from '@/components/ui/button';
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
    <Button variant="ghost" size="icon" onClick={toggleTheme} title={`Theme: ${label}`}>
      <Icon className="size-4" />
    </Button>
  );
}
