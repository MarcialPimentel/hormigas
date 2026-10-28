// Which nest the Colony screen shows (docs/12-ui-nest-view.md): the 3D slab on computers, the 2D nest on
// phones. Either can be switched to the other; the choice is saved per browser. If the 3D nest can't start
// (no WebGL), the 2D nest takes over.
import { lazy, Suspense, useState } from 'react';
import { NestView } from './NestView';
import type { Nav } from '../nav';

const Nest3D = lazy(() => import('./nest3d/Nest3D').then((m) => ({ default: m.Nest3D })));
const KEY = 'hormigas.nest';
type View = '3d' | '2d';

const finePointer = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;

function savedView(): View {
  try {
    const v = localStorage.getItem(KEY);
    if (v === '3d' || v === '2d') return v;
  } catch {
    /* no storage: use the default */
  }
  return finePointer() && window.innerWidth >= 760 ? '3d' : '2d';
}

export function NestHome({ nav }: { nav: Nav }) {
  const [view, setView] = useState<View>(savedView);
  const [failed, setFailed] = useState(false);
  const choose = (v: View) => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* not saved; still applies until reload */
    }
    setView(v);
  };
  const flat = <NestView nav={nav} onSwitch3d={!failed && finePointer() ? () => choose('3d') : undefined} />;
  if (view === '2d' || failed) return flat;
  return (
    <Suspense fallback={<NestView nav={nav} />}>
      <Nest3D nav={nav} onFail={() => setFailed(true)} onSwitch={() => choose('2d')} />
    </Suspense>
  );
}
