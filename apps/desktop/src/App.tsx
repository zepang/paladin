import { Titlebar } from '@/components/Titlebar';
import { initWindowEvents } from '@/stores/window';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    initWindowEvents();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Titlebar />
      <main className="flex-1 flex items-center justify-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">Paladin — AI 编程助手</p>
      </main>
    </div>
  );
}

export default App;
