import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Banner shown when a new build is waiting in the service worker.
 * `registerType: 'prompt'` in vite.config.ts means the SW won't activate
 * automatically — the user must confirm so they don't lose in-progress work
 * (e.g. an unsaved order). On confirm, `updateServiceWorker(true)` swaps
 * the SW and reloads the page.
 *
 * In dev (`import.meta.env.PROD === false`) the SW isn't registered, so
 * `needRefresh` stays false and the banner never appears.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(err) {
      if (import.meta.env.DEV) console.error('SW registration failed:', err);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        background: 'var(--brand, #C9477A)',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: 12,
        boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        maxWidth: 360,
        fontSize: 14,
      }}
    >
      <span>Có bản cập nhật mới.</span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: '#fff',
          color: 'var(--brand, #C9477A)',
          border: 'none',
          borderRadius: 8,
          padding: '6px 12px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Tải lại
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        aria-label="Đóng"
        style={{
          background: 'transparent',
          color: '#fff',
          border: 'none',
          fontSize: 18,
          cursor: 'pointer',
          padding: '0 4px',
        }}
      >
        ×
      </button>
    </div>
  );
}
