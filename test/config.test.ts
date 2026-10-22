import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMERS, readConfig } from '../src/config.js';

describe('the plugin’s settings', () => {
  it('needs the unit’s address', () => {
    expect(() => readConfig({ name: 'Ventilation' })).toThrow(/Set "ip"/);
  });

  it('fills in what 1.x settings leave out', () => {
    expect(readConfig({ accessory: 'SystemairVentilatorEnhanced', name: 'Ventilation', ip: '192.168.68.57' })).toEqual({
      name: 'Ventilation',
      ip: '192.168.68.57',
      pollSeconds: 10,
      // Refresh and Fireplace have timers, which turn them on and off.
      modeSwitches: ['auto', 'crowded', 'away', 'holiday'],
      timers: DEFAULT_TIMERS,
      modeNames: { crowded: 'Visitors' },
      eco: true,
      outdoorTemperature: true,
      filter: true,
    });
  });

  it('keeps only modes it can show, and a poll the unit can keep up with', () => {
    const config = readConfig({
      ip: 'unit',
      pollSeconds: 1,
      modeSwitches: ['refresh', 'cookerHood', 'manual', 'nonsense'],
      timers: ['away', 'fireplace'],
      modeNames: { crowded: ' Guests ', refresh: '' },
    });
    expect(config.pollSeconds).toBe(10);
    // Cooker hood is started by a wired switch; Manual is the fan's speed.
    expect(config.modeSwitches).toEqual(['refresh']);
    // Away lasts hours: more than a HomeKit timer counts down.
    expect(config.timers).toEqual(['fireplace']);
    expect(config.modeNames).toEqual({ crowded: 'Guests' });
  });
});
