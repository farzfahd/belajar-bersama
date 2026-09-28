// Harness CDP minimal untuk validasi FilterPanel (headless Chrome via DevTools).
// Dipisah dari test agar bisa dipakai ulang oleh beberapa skenario.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  const c = [
    process.env.E2E_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find((x) => x && existsSync(x));
  if (!c) throw new Error('Chrome/Edge tidak ditemukan. Set E2E_CHROME.');
  return c;
}

export async function connect(port) {
  const proc = spawn(
    findChrome(),
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'cdp-'))}`,
      '--no-first-run',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1440,900',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  let targets = null;
  for (let i = 0; i < 40 && !targets; i++) {
    await sleep(250);
    try {
      targets = await new Promise((res, rej) => {
        const req = http.get(`http://127.0.0.1:${port}/json`, (r) => {
          let d = '';
          r.on('data', (c) => (d += c));
          r.on('end', () => res(JSON.parse(d)));
        });
        req.on('error', rej);
        req.setTimeout(1000, () => req.destroy(new Error('timeout')));
      });
    } catch {
      /* belum siap */
    }
  }
  if (!targets) throw new Error('DevTools tidak merespons');

  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  let seq = 1;
  const pend = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id);
      pend.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  });
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = seq++;
      pend.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send('Page.enable');
  await send('Runtime.enable');

  return {
    send,
    async ev(expression, awaitPromise = false) {
      const r = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise,
        userGesture: true
      });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      }
      return r.result.value;
    },
    async json(expr) {
      return JSON.parse(await this.ev(`JSON.stringify(${expr})`));
    },
    async viewport(width, height) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false
      });
      await sleep(500);
    },
    async go(url, wait = 2200) {
      await send('Page.navigate', { url });
      await sleep(wait);
    },
    async key(name) {
      const codes = { Escape: 27, Tab: 9, Enter: 13 };
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: name,
        code: name,
        windowsVirtualKeyCode: codes[name] || 0
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name });
      await sleep(400);
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    close() {
      try {
        ws.close();
      } catch {
        /* sudah tertutup */
      }
      proc.kill();
    }
  };
}
