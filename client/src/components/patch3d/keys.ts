// Keys held down to move a 3D view: WASD or the arrows slide it, Q/E turn it, Shift goes faster.
// Read every frame, so holding a key glides rather than steps. Ignored while typing in a box
// or with Ctrl/Alt/Cmd held (so browser shortcuts like Ctrl+W still work).

const SLIDE: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
const TURN: Record<string, number> = { KeyQ: 1, KeyE: -1 };

export interface MoveKeys {
  /** Right (+) / left (−), forward (+) / back (−), turn left (+) / right (−), and Shift for faster. */
  read(): { right: number; forward: number; turn: number; fast: boolean };
  /** Is any moving key held? */
  active(): boolean;
  dispose(): void;
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** `listening()` says whether the view is on screen right now; keys pressed while it isn't are left alone. */
export function moveKeys(opts: { turn: boolean; listening: () => boolean }): MoveKeys {
  const held = new Set<string>();
  let fast = false;
  const ours = (code: string) => code in SLIDE || (opts.turn && code in TURN);
  const onDown = (e: KeyboardEvent) => {
    fast = e.shiftKey;
    if (!ours(e.code) || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || !opts.listening()) return;
    held.add(e.code);
    e.preventDefault();
  };
  const onUp = (e: KeyboardEvent) => {
    fast = e.shiftKey;
    held.delete(e.code);
  };
  // a key let go while the window was in the background never sends its keyup
  const clear = () => held.clear();
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', clear);
  return {
    read() {
      let right = 0, forward = 0, turn = 0;
      for (const c of held) {
        const s = SLIDE[c];
        if (s) {
          right += s[0];
          forward += s[1];
        }
        turn += TURN[c] ?? 0;
      }
      // diagonals no faster than straight lines
      const len = Math.hypot(right, forward);
      if (len > 1) {
        right /= len;
        forward /= len;
      }
      return { right, forward, turn: Math.sign(turn), fast };
    },
    active: () => held.size > 0,
    dispose() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', clear);
    },
  };
}
