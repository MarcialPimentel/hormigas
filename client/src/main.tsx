import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './game';
import { App } from './App';
import { applyMotionPref } from './motion';
import './styles.css';

applyMotionPref();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameProvider>
      <App />
    </GameProvider>
  </StrictMode>,
);
