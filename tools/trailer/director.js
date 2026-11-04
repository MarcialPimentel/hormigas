// Runs inside the game page before it loads (a Playwright init script), for the trailer tools only.
// A fake clock: animation frames, performance.now() and Date.now() only move when the tool calls __trailer.tick(),
// so every frame is captured exactly, however long a screenshot takes. Timers and the network stay real.
// Date.now() can run faster than the animation (a time-lapse of the game's own clock: columns march further).
// Nothing here ships in the game.

(() => {
  try {
    for (const [k, v] of Object.entries(window.__TRAILER_LOCAL || {})) localStorage.setItem(k, v);
  } catch {
    /* no storage */
  }
  const realDateNow = Date.now.bind(Date);
  const realPerf = performance.now.bind(performance);
  const clock = { t: 0, cbs: new Map(), id: 0, lapse: 1, date0: realDateNow(), dateT: 0, perf0: realPerf() };
  window.requestAnimationFrame = (cb) => {
    clock.cbs.set(++clock.id, cb);
    return clock.id;
  };
  window.cancelAnimationFrame = (id) => {
    clock.cbs.delete(id);
  };
  performance.now = () => clock.perf0 + clock.t * 1000;
  Date.now = () => Math.round(clock.date0 + clock.dateT * 1000);
  const RealDate = Date;
  // new Date() with no arguments reads the fake clock too
  window.Date = new Proxy(RealDate, {
    construct(T, args) {
      return args.length ? new T(...args) : new T(Date.now());
    },
  });

  window.__trailer = {
    clock,
    /** Move on by `secs`, n times, running the animation frame callbacks each time. */
    tick(secs, n = 1) {
      for (let i = 0; i < n; i++) {
        clock.t += secs;
        clock.dateT += secs * clock.lapse;
        const cbs = [...clock.cbs.values()];
        clock.cbs.clear();
        for (const cb of cbs) {
          try {
            cb(performance.now());
          } catch (e) {
            console.error(e);
          }
        }
      }
    },
    /** Game time runs k× faster than the animation (1 = normal). */
    lapse(k) {
      clock.lapse = k;
    },
    /** Put the game's clock back on real time (between shots, so the server and the page agree). */
    sync() {
      clock.date0 = realDateNow();
      clock.dateT = 0;
    },
    /** Hide the game's chrome for a clean shot ('none'), or show it ('all'). */
    chrome(mode) {
      let st = document.getElementById('__trailerCss');
      if (!st) {
        st = document.createElement('style');
        st.id = '__trailerCss';
        document.head.appendChild(st);
      }
      st.textContent = mode === 'none' ? window.__TRAILER_HIDE || '' : '';
    },
  };
})();
