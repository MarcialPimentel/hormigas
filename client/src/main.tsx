import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './game';
import { App } from './App';
import { applyMotionPref } from './motion';
import './styles.css';

applyMotionPref();

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
