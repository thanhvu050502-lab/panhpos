import React, { useEffect } from 'react';
import { Index } from './pages/Index';
import { ConfirmAlertProvider } from './components/ui/ConfirmAlertProvider';
import { LangProvider } from './contexts/LangContext';
import { UpdatePrompt } from './components/ui/UpdatePrompt';
import { installAutoFlush } from './lib/writeQueue';
import { toast } from './components/ui/Toast';
import './App.css';

function App() {
  useEffect(() => {
    // Replay any writes that were queued while offline. This boots once on
    // app load and again on every `online` event.
    installAutoFlush(({ ok, failed, left }) => {
      if (ok > 0) {
        toast(`Đã đồng bộ ${ok} thao tác offline${failed ? ` (${failed} lỗi)` : ''}`, ok && !failed ? 'success' : 'info');
      }
      if (left > 0 && !ok && !failed) {
        // Will retry on next online event; no toast.
      }
    });
  }, []);

  return (
    <LangProvider>
      <ConfirmAlertProvider>
        <Index />
        <UpdatePrompt />
      </ConfirmAlertProvider>
    </LangProvider>
  );
}

export default App;
