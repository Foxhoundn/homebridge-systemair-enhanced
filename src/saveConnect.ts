import type { TRegisterValues, TRegisterWrite } from './state.js';

export type TFetch = (input: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export interface ISaveConnectOptions {
  /** The SAVE Connect module's address: "192.168.68.57". */
  host: string;
  /** How long one request may take. The module is slow, but not this slow. */
  timeoutMs?: number;
  fetch?: TFetch;
}

export class SaveConnectError extends Error {}

/**
 * Talks to a SAVE Connect module the way its own web page does. Requests go one at a time: the
 * module answers one request at a time, and a read racing a write could return the old value.
 */
export class SaveConnect {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly fetch: TFetch;
  private readonly timeoutMs: number;

  public constructor(private readonly options: ISaveConnectOptions) {
    this.fetch = options.fetch ?? (globalThis.fetch as unknown as TFetch);
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  /** Reads registers (register → how many) in one request. */
  public async read(registers: Readonly<Record<number, number>>): Promise<TRegisterValues> {
    const text = await this.request('mread', registers);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new SaveConnectError(`The unit's answer wasn't JSON: ${text.slice(0, 80)}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new SaveConnectError(`The unit's answer wasn't a set of registers: ${text.slice(0, 80)}`);
    const values: Record<string, number> = {};
    for (const [register, raw] of Object.entries(parsed)) {
      const number = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(number)) values[register] = number;
    }
    return values;
  }

  /** Writes registers in one request (lowest register first, as JSON orders them). */
  public async write(values: TRegisterWrite): Promise<void> {
    await this.request('mwrite', values);
  }

  private request(path: 'mread' | 'mwrite', body: Readonly<Record<number, number>>): Promise<string> {
    const run = async (): Promise<string> => {
      const url = `http://${this.options.host}/${path}?${JSON.stringify(body)}`;
      let response;
      try {
        response = await this.fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (error) {
        throw new SaveConnectError(
          `Couldn't reach the unit at ${this.options.host}: ${(error as Error).message}`
        );
      }
      if (!response.ok)
        throw new SaveConnectError(`The unit answered ${path} with HTTP ${response.status}`);
      return response.text();
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
