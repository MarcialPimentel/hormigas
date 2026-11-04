// The trailer's music: the game's own march (client/src/audio/march.ts), rendered offline into a WAV on a
// timeline that follows the edit (`cues`: [seconds, 'idle' | 'march' | 'tense'], each taking over at the next bar
// line, as in the game). Seeded, so every render plays the same tune.

import { writeFileSync } from 'node:fs';

/** Render `secs` of the march into `file`, in a page served by the game's dev server. */
export async function renderMusic(browser, url, cues, secs, file) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('music page error:', e.message));
  // a blank page on the game's origin (not the game itself, so nothing else drives the music)
  await page.route(`${url}__trailer_blank`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>music</title>' }));
  await page.goto(`${url}__trailer_blank`);
  const b64 = await page.evaluate(async ({ cues, secs }) => {
    let seed = 20261102;
    Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
    const rate = 48000;
    const off = new OfflineAudioContext(2, Math.ceil(rate * secs), rate);
    let t = 0;
    const proxy = new Proxy(off, {
      get(o, k) {
        if (k === 'currentTime') return t;
        if (k === 'state') return 'running';
        if (k === 'resume' || k === 'suspend' || k === 'close') return () => Promise.resolve();
        const v = Reflect.get(o, k);
        return typeof v === 'function' ? v.bind(o) : v;
      },
      set(o, k, v) {
        if (k === 'onstatechange') return true;
        return Reflect.set(o, k, v);
      },
    });
    window.AudioContext = function () { return proxy; };
    localStorage.removeItem('hormigas.sound'); // the game's default levels
    const { engine } = await import('/src/audio/engine.ts');
    const { March } = await import('/src/audio/march.ts');
    const realInterval = window.setInterval;
    window.setInterval = () => 1; // the march's pump is driven by hand below
    engine.wake();
    // wait for the footstep recordings
    for (let i = 0; i < 100 && !engine.samples.has('step'); i++) await new Promise((r) => setTimeout(r, 100));
    const m = new March();
    let next = 0;
    const step = 0.025;
    for (; t < secs - 0.15; t += step) {
      while (next < cues.length && cues[next][0] <= t) m.set(cues[next++][1]);
      m.pump();
    }
    window.setInterval = realInterval;
    const buf = await off.startRendering();
    const n = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(1)];
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, x) => { for (let i = 0; i < x.length; i++) out.setUint8(o + i, x.charCodeAt(i)); };
    str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); out.setUint32(16, 16, true);
    out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, rate, true);
    out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
    str(36, 'data'); out.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) out.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true);
    let bin = '';
    const u8 = new Uint8Array(out.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin);
  }, { cues, secs });
  writeFileSync(file, Buffer.from(b64, 'base64'));
  await page.close();
}
