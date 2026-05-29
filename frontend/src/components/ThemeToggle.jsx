import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  );

  function toggle() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      html.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}
