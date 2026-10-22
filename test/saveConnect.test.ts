import { describe, expect, it, vi } from 'vitest';
import { SaveConnect, SaveConnectError, type TFetch } from '../src/saveConnect.js';

const reply = (text: string, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => text,
});

describe('talking to SAVE Connect', () => {
  it('reads registers the way the unit’s web page does, in one request', async () => {
    const fetch = vi.fn<TFetch>(async () => reply('{"1160":3,"1110":1800,"1111":0}'));
    const unit = new SaveConnect({ host: '192.168.68.57', fetch });
    await expect(unit.read({ 1160: 1, 1110: 2 })).resolves.toEqual({
      '1160': 3,
      '1110': 1800,
      '1111': 0,
    });
    expect(fetch.mock.calls[0]?.[0]).toBe('http://192.168.68.57/mread?{"1110":2,"1160":1}');
  });

  it('writes registers in one request', async () => {
    const fetch = vi.fn<TFetch>(async () => reply('OK'));
    await new SaveConnect({ host: 'unit', fetch }).write({ 1161: 4, 1103: 35 });
    expect(fetch.mock.calls[0]?.[0]).toBe('http://unit/mwrite?{"1103":35,"1161":4}');
  });

  it('says what went wrong: unreachable, an error status, or an answer that isn’t registers', async () => {
    const down = new SaveConnect({
      host: 'unit',
      fetch: async () => {
        throw new Error('connect EHOSTUNREACH');
      },
    });
    await expect(down.read({ 1160: 1 })).rejects.toThrow(/Couldn't reach the unit at unit/);
    const busy = new SaveConnect({ host: 'unit', fetch: async () => reply('', 503) });
    await expect(busy.read({ 1160: 1 })).rejects.toThrow(SaveConnectError);
    const odd = new SaveConnect({ host: 'unit', fetch: async () => reply('<html>') });
    await expect(odd.read({ 1160: 1 })).rejects.toThrow(/wasn't JSON/);
  });

  it('asks one thing at a time, even after a failure', async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const fetch = vi.fn<TFetch>(async (url) => {
      order.push(`start ${url.includes('mwrite') ? 'write' : 'read'}`);
      if (url.includes('mwrite')) await new Promise<void>((resolve) => (release = resolve));
      order.push(`end ${url.includes('mwrite') ? 'write' : 'read'}`);
      return reply('{}');
    });
    const unit = new SaveConnect({ host: 'unit', fetch });
    const write = unit.write({ 1161: 4 });
    const read = unit.read({ 1160: 1 });
    await vi.waitFor(() => expect(order).toEqual(['start write']));
    release();
    await Promise.all([write, read]);
    expect(order).toEqual(['start write', 'end write', 'start read', 'end read']);
  });
});
