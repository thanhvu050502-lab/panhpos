import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

// Service worker registration is handled inside <UpdatePrompt /> via
// useRegisterSW from 'virtual:pwa-register/react'. registerType: 'prompt'
// in vite.config.ts means new SW versions wait for the user to click "Tải lại"
// instead of activating silently — see src/components/ui/UpdatePrompt.tsx.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
);
