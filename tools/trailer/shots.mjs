// What every trailer page shares: the browser settings the game starts with, and the chrome hidden for clean shots.

/** localStorage before the game loads: the Whole Yard on, the 3D views, sound on, motion on. */
export const LOCAL = {
  'hormigas.preview.yard': '1',
  'hormigas.nest': '3d',
  'hormigas.patch': '3d',
  'hormigas.sound': JSON.stringify({ music: 0, sfx: 0, on: false }),
};

/** The game's menus, bars and cards, hidden so the picture is just the world. */
export const HIDE = `.topbar,.resbar,.nav,.yard-rail,.yard-top,.yard-right,.yard-help,.yard-battle,.toasts,.away-card,.fps-meter{display:none!important}
.app.yard-mode{grid-template-rows:minmax(0,1fr)!important}.app.yard-mode .content{grid-row:1!important}`;
