import net from 'node:net';

/**
 * Minimal Firefox Remote Debugging Protocol (RDP) client for the install
 * tests. `web-ext run` already speaks RDP to install the temporary add-on,
 * but its client drops every packet that is not a reply to a pending request
 * (watcher target forms, resource events, `evaluationResult`), so the test
 * opens a second connection to the same debugger port and drives the
 * modern "watcher" actors itself:
 *
 *   listAddons → webExtensionDescriptor → getWatcher → watchTargets(frame)
 *     → target-available-form (the real `_generated_background_page.html`,
 *       not the devtools fallback document) → consoleActor
 *   watcher.watchResources(console-message, error-message)
 *     → resources-available-array (replays what is already cached)
 *   consoleActor.evaluateJSAsync → evaluationResult
 *
 * Verified against Firefox 157; the packet names are the ones the devtools
 * frontend itself uses (devtools/shared/commands/*), which Mozilla keeps
 * stable across versions far longer than the legacy `getTarget` path that
 * extension descriptors dropped.
 */

type Packet = { from?: string; type?: string; [key: string]: unknown };

export type TargetForm = {
  actor: string;
  url?: string;
  consoleActor: string;
  isFallbackExtensionDocument?: boolean;
  addonId?: string;
  [key: string]: unknown;
};

export type AddonDescriptor = {
  actor: string;
  id: string;
  name: string;
  manifestURL?: string;
  temporarilyInstalled?: boolean;
  isWebExtension?: boolean;
  warnings?: string[];
  [key: string]: unknown;
};

export type TabDescriptor = { actor: string; url?: string; title?: string };

export class FirefoxRdp {
  private sock!: net.Socket;
  private buf = Buffer.alloc(0);
  private waiters = new Map<string, { resolve: (p: Packet) => void; reject: (e: Error) => void }>();
  /** Packets that were not replies: watcher events, resource batches, evaluation results. */
  readonly events: Packet[] = [];
  private closed = false;

  static connect(port: number, host = '127.0.0.1'): Promise<FirefoxRdp> {
    const c = new FirefoxRdp();
    return new Promise((resolve, reject) => {
      c.sock = net.createConnection({ port, host });
      c.sock.on('data', (d: Buffer) => c.onData(d));
      c.sock.on('error', (e) => {
        for (const w of c.waiters.values()) w.reject(e);
        c.waiters.clear();
        if (!c.closed) reject(e);
      });
      c.sock.on('close', () => {
        c.closed = true;
        for (const w of c.waiters.values()) w.reject(new Error('RDP connection closed'));
        c.waiters.clear();
      });
      // The server greets with a `{from: "root"}` hello packet.
      c.waiters.set('root', { resolve: () => resolve(c), reject });
    });
  }

  close(): void {
    this.closed = true;
    this.sock.end();
    this.sock.destroy();
  }

  private onData(d: Buffer): void {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const sep = this.buf.indexOf(':');
      if (sep < 1) return;
      const len = Number.parseInt(this.buf.subarray(0, sep).toString('latin1'), 10);
      if (!Number.isFinite(len)) throw new Error(`bad RDP frame: ${this.buf.subarray(0, 40).toString()}`);
      const start = sep + 1;
      if (this.buf.length - start < len) return;
      const packet = JSON.parse(this.buf.subarray(start, start + len).toString('utf8')) as Packet;
      this.buf = this.buf.subarray(start + len);
      const waiter = packet.from ? this.waiters.get(packet.from) : undefined;
      // Replies carry no `type`; everything typed is an event from that actor.
      if (waiter && !packet.type) {
        this.waiters.delete(packet.from!);
        if (packet.error) waiter.reject(new Error(`RDP ${packet.error}: ${String(packet.message)}`));
        else waiter.resolve(packet);
      } else {
        this.events.push(packet);
      }
    }
  }

  /** Send one request and await its reply (one in-flight request per actor, like Firefox requires). */
  request<T extends Packet = Packet>(req: { to: string; type: string; [key: string]: unknown }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.waiters.has(req.to)) {
        reject(new Error(`actor ${req.to} already has a pending request`));
        return;
      }
      this.waiters.set(req.to, { resolve: (p) => resolve(p as T), reject });
      const str = JSON.stringify(req);
      this.sock.write(`${Buffer.byteLength(str)}:${str}`);
    });
  }

  /** Wait for (and consume) the first queued event matching `pred`. */
  waitEvent<T extends Packet = Packet>(pred: (p: Packet) => boolean, timeoutMs = 15_000, what = 'event'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        const i = this.events.findIndex(pred);
        if (i >= 0) {
          resolve(this.events.splice(i, 1)[0] as T);
          return;
        }
        if (Date.now() > deadline) {
          const seen = this.events.map((e) => e.type ?? '?').join(', ');
          reject(new Error(`timed out waiting for ${what}; queued events: [${seen}]`));
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async listAddons(): Promise<AddonDescriptor[]> {
    const r = await this.request<{ addons: AddonDescriptor[] }>({ to: 'root', type: 'listAddons' });
    return r.addons;
  }

  async listTabs(): Promise<TabDescriptor[]> {
    const r = await this.request<{ tabs: TabDescriptor[] }>({ to: 'root', type: 'listTabs' });
    return r.tabs;
  }

  /**
   * Attach to a descriptor (add-on or tab) through its watcher and return
   * the first top-level `moz-extension://` document target it reports,
   * skipping the devtools fallback page shown for add-ons without a
   * background document.
   */
  async attach(descriptorActor: string, timeoutMs = 15_000): Promise<{ watcher: string; target: TargetForm }> {
    const w = await this.request<{ actor: string }>({ to: descriptorActor, type: 'getWatcher', isServerTargetSwitchingEnabled: true });
    await this.request({ to: w.actor, type: 'watchTargets', targetType: 'frame' });
    const ev = await this.waitEvent<{ target: TargetForm }>(
      (p) =>
        p.type === 'target-available-form' &&
        p.from === w.actor &&
        !(p.target as TargetForm).isFallbackExtensionDocument &&
        ((p.target as TargetForm).url ?? '').startsWith('moz-extension://'),
      timeoutMs,
      `a moz-extension:// target of ${descriptorActor}`,
    );
    return { watcher: w.actor, target: ev.target };
  }

  /**
   * Start streaming console and error messages of a watcher. Firefox replays
   * the messages it already cached, so calling this after the page booted
   * still yields the boot-time logs. Returns a live log you can poll.
   */
  async watchConsole(watcher: string, target: TargetForm): Promise<ConsoleLog> {
    const log = new ConsoleLog(this, [watcher, target.actor]);
    await this.request({ to: watcher, type: 'watchResources', resourceTypes: ['console-message', 'error-message'] });
    return log;
  }

  /**
   * Evaluate `text` in a console actor's global and return the primitive /
   * JSON-serialisable result. Firefox answers `evaluateJSAsync` with a
   * `resultID` and later emits a matching `evaluationResult` event.
   */
  async evaluate(consoleActor: string, text: string, timeoutMs = 15_000): Promise<unknown> {
    const ack = await this.request<{ resultID: string }>({ to: consoleActor, type: 'evaluateJSAsync', text });
    const res = await this.waitEvent<{ hasException?: boolean; exceptionMessage?: string; result?: unknown }>(
      (p) => p.type === 'evaluationResult' && p.resultID === ack.resultID,
      timeoutMs,
      `evaluationResult of ${JSON.stringify(text.slice(0, 60))}`,
    );
    if (res.hasException) throw new Error(`evaluation threw: ${res.exceptionMessage}\n  in: ${text}`);
    return res.result;
  }

  /**
   * Evaluate an expression that yields a promise, wait for it to settle and
   * return the JSON-serialised fulfilment value. Object results come back as
   * actor grips over RDP, so the page stores the value in a global and the
   * test reads it back as a string.
   */
  async evaluateAsyncJson(consoleActor: string, promiseExpr: string, timeoutMs = 15_000): Promise<unknown> {
    const slot = `__aipageInstallTest_${Math.random().toString(36).slice(2)}`;
    await this.evaluate(
      consoleActor,
      `globalThis["${slot}"] = undefined; Promise.resolve().then(() => (${promiseExpr})).then(
        (v) => { globalThis["${slot}"] = JSON.stringify({ ok: true, value: v === undefined ? null : v }); },
        (e) => { globalThis["${slot}"] = JSON.stringify({ ok: false, error: String(e && e.message || e) }); });
      true`,
    );
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const raw = await this.evaluate(consoleActor, `globalThis["${slot}"]`);
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw) as { ok: boolean; value?: unknown; error?: string };
        if (!parsed.ok) throw new Error(`promise rejected: ${parsed.error}\n  in: ${promiseExpr}`);
        return parsed.value;
      }
      if (Date.now() > deadline) throw new Error(`promise did not settle within ${timeoutMs}ms: ${promiseExpr}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

export type ConsoleEntry = { kind: 'console' | 'error'; level: string; text: string; raw: unknown };

/**
 * Accumulates `resources-available-array` console/error resources of one
 * target. Firefox emits them from the target actor itself (window-global
 * resources) or from the watcher (watcher-scoped resources), so both senders
 * are accepted.
 */
export class ConsoleLog {
  constructor(
    private readonly rdp: FirefoxRdp,
    private readonly senders: string[],
  ) {}

  /** Drain matching resource batches from the event queue and flatten them. */
  entries(): ConsoleEntry[] {
    const out: ConsoleEntry[] = [];
    for (let i = this.rdp.events.length - 1; i >= 0; i--) {
      const p = this.rdp.events[i];
      if (p.type !== 'resources-available-array' || !this.senders.includes(p.from ?? '')) continue;
      this.rdp.events.splice(i, 1);
      for (const [resourceType, resources] of p.array as [string, Record<string, unknown>[]][]) {
        for (const r of resources) out.push(toEntry(resourceType, r));
      }
    }
    this.collected.push(...out);
    return this.collected;
  }

  private collected: ConsoleEntry[] = [];

  /** Poll until some entry's text contains `needle`. */
  async waitFor(needle: string, timeoutMs = 20_000): Promise<ConsoleEntry> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.entries().find((e) => e.text.includes(needle));
      if (hit) return hit;
      if (Date.now() > deadline) {
        const seen = this.collected.map((e) => `${e.kind}/${e.level}: ${e.text.slice(0, 120)}`).join('\n  ');
        throw new Error(`no console message containing ${JSON.stringify(needle)} within ${timeoutMs}ms; seen:\n  ${seen}`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  /** Error-level entries, minus failures to load remote (https) resources. */
  errors(): ConsoleEntry[] {
    return this.entries().filter((e) => (e.kind === 'error' || e.level === 'error') && !isRemoteLoadFailure(e.text));
  }
}

function isRemoteLoadFailure(text: string): boolean {
  // Google Fonts etc. may be unreachable in a sandbox; only extension-origin
  // problems are ours.
  return /https?:\/\//.test(text) && /(load|fetch|network|NS_ERROR|blocked|refused)/i.test(text) && !/moz-extension:\/\//.test(text);
}

function toEntry(resourceType: string, r: Record<string, unknown>): ConsoleEntry {
  if (resourceType === 'error-message') {
    const pe = (r.pageError ?? r) as Record<string, unknown>;
    const text = String(pe.errorMessage ?? pe.message ?? JSON.stringify(r));
    const warning = pe.warning === true || pe.info === true;
    return { kind: 'error', level: warning ? 'warning' : 'error', text, raw: r };
  }
  const args = Array.isArray(r.arguments) ? r.arguments : [];
  const text = args
    .map((a) => (typeof a === 'string' ? a : a && typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ');
  return { kind: 'console', level: String(r.level ?? 'log'), text, raw: r };
}
