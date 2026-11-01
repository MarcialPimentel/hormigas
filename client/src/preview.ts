// Preview switches: features that ship switched off so Marz can playtest them on the live game before players see
// them. Open the game with ?preview=yard to turn the Whole Yard on in this browser, ?preview=off to turn it off.
const KEY = 'hormigas.preview.yard';

function read(): boolean {
  try {
    const p = new URLSearchParams(location.search).get('preview');
    if (p === 'yard') localStorage.setItem(KEY, '1');
    if (p === 'off') localStorage.removeItem(KEY);
    if (p) history.replaceState(null, '', location.pathname + location.hash);
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** The Whole Yard: one map from the yard to the nest (docs/art/whole-yard.md). */
export const yardPreview = read();

export function leaveYardPreview() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing saved */
  }
  location.reload();
}
