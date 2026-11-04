// Preview switches: features that ship switched off so Marz can playtest them on the live game before players see
// them. Open the game with ?preview=phone3d for the phone 3D test, ?preview=off to turn it off.
// (The Whole Yard was the ?preview=yard switch; it is now the game on every computer.)
const PHONE_KEY = 'hormigas.preview.phone3d';

function read(): { phone3d: boolean } {
  try {
    localStorage.removeItem('hormigas.preview.yard'); // the old Whole Yard switch, no longer used
    const p = new URLSearchParams(location.search).get('preview');
    if (p === 'phone3d') {
      // start the test in 3D, whatever was picked before
      localStorage.setItem(PHONE_KEY, '1');
      localStorage.setItem('hormigas.nest', '3d');
      localStorage.setItem('hormigas.patch', '3d');
    }
    if (p === 'off') {
      localStorage.removeItem(PHONE_KEY);
    }
    if (p) history.replaceState(null, '', location.pathname + location.hash);
    return { phone3d: localStorage.getItem(PHONE_KEY) === '1' };
  } catch {
    return { phone3d: false };
  }
}
const on = read();

/**
 * The phone 3D test (.claude/handoff/phone-experience.md): lets a touch screen open the 3D nest and the 3D patch
 * (with their existing cheaper phone setting), adds pinch and zoom buttons to the nest, and shows a frame-rate meter.
 */
export const phone3dPreview = on.phone3d;

export function leavePhone3dPreview() {
  try {
    localStorage.removeItem(PHONE_KEY);
    // back to each view's own default (2D on phones)
    localStorage.removeItem('hormigas.nest');
    localStorage.removeItem('hormigas.patch');
  } catch {
    /* nothing saved */
  }
  location.reload();
}
