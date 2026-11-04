import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './game';
import { App } from './App';
import { applyMotionPref } from './motion';
import './styles.css';

applyMotionPref();

// After a deploy, a tab opened on the old build asks for screen files (like the nest) that no longer exist.
// Vite fires vite:preloadError when such a lazy load fails: reload once to pick up the new build instead of
// leaving a blank screen. The timestamp stops a reload loop if the file is missing for some other reason.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'hormigas:staleReloadAt';
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(key)) || 0;
    if (Date.now() - last < 30_000) return; // just reloaded and it still fails: let the error show
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return; // storage blocked: no way to guard against a loop, so don't reload
  }
  event.preventDefault();
  location.reload();
});

// /?test opens the test scene (docs/test-bed.md): a made-up world that never talks to the server, loaded only then
const TestScene = new URLSearchParams(location.search).has('test') ? lazy(() => import('./test/TestScene')) : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {TestScene ? (
      <Suspense fallback={null}>
        <TestScene />
      </Suspense>
    ) : (
      <GameProvider>
        <App />
      </GameProvider>
    )}
  </StrictMode>,
);
