// Preview switches: features that ship switched off so Marz can playtest them on the live game before players see
// them. Open the game with ?preview=yard to turn the Whole Yard on in this browser, ?preview=phone3d for the phone 3D
// test, ?preview=off to turn both off.
const KEY = 'hormigas.preview.yard';
const PHONE_KEY = 'hormigas.preview.phone3d';

function read(): { yard: boolean; phone3d: boolean } {
  try {
    const p = new URLSearchParams(location.search).get('preview');
    if (p === 'yard') localStorage.setItem(KEY, '1');
    if (p === 'phone3d') {
      // start the test in 3D, whatever was picked before
      localStorage.setItem(PHONE_KEY, '1');
      localStorage.setItem('hormigas.nest', '3d');
      localStorage.setItem('hormigas.patch', '3d');
    }
    if (p === 'off') {
      localStorage.removeItem(KEY);
      localStorage.removeItem(PHONE_KEY);
    }
    if (p) history.replaceState(null, '', location.pathname + location.hash);
    return { yard: localStorage.getItem(KEY) === '1', phone3d: localStorage.getItem(PHONE_KEY) === '1' };
  } catch {
    return { yard: false, phone3d: false };
  }
}
const on = read();

/** The Whole Yard: one map from the yard to the nest (docs/art/whole-yard.md). */
export const yardPreview = on.yard;

/**
 * The phone 3D test (.claude/handoff/phone-experience.md): lets a touch screen open the 3D nest and the 3D patch
 * (with their existing cheaper phone setting), adds pinch and zoom buttons to the nest, and shows a frame-rate meter.
 */
export const phone3dPreview = on.phone3d;

export function leaveYardPreview() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing saved */
  }
  location.reload();
}

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
