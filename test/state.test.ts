import { describe, expect, it } from 'vitest';
import { durationSeconds, durationValue, MODES, modeById, SETTABLE_MODES } from '../src/modes.js';
import {
  AUTO_WRITE,
  durationWrite,
  ecoWrite,
  filterLifePercent,
  isMissingRegister,
  isStopped,
  fanSpeed,
  levelForSpeed,
  manualWrite,
  modeWrite,
  readState,
  setpointWrite,
} from '../src/state.js';
import { fanLevel } from '../src/registers.js';
import { POLLED, REFRESH_REPLY, UNIT_REPLY } from './fixtures.js';

describe('reading the unit', () => {
  it('reads every register it polls, and nothing it doesn’t', () => {
    expect([...POLLED].sort()).toEqual(Object.keys(UNIT_REPLY).sort());
  });

  it('says what the unit is doing, in plain units', () => {
    const state = readState(UNIT_REPLY);
    expect(state).toMatchObject({
      mode: 'auto',
      remainingSeconds: 0,
      manualLevel: 2,
      manualStopAllowed: true,
      supplyFanPercent: 55,
      extractFanPercent: 37,
      fanLevel: 'low',
      extractTemperature: 22.4,
      outdoorTemperature: 10.1,
      setpoint: 22,
      humidity: 46,
      eco: false,
      filterPeriodMonths: 6,
      durations: { refresh: 35, fireplace: 45, crowded: 6, away: 8, holiday: 14 },
    });
    // 103 × 65536 + 61763 seconds: about 79 days of a 6-month filter left.
    expect(state.filterRemainingSeconds).toBe(6_811_971);
    expect(filterLifePercent(state)).toBe(44);
  });

  it('reads a timed mode and its time left', () => {
    const state = readState(REFRESH_REPLY);
    expect(state.mode).toBe('refresh');
    expect(state.remainingSeconds).toBe(1800);
    expect(state.fanLevel).toBe('maximum');
  });

  it('knows the level Auto picked from the fans’ outputs: the closest set level', () => {
    const at = (supply: number, extract: number) =>
      readState({ ...UNIT_REPLY, '14000': supply, '14001': extract }).fanLevel;
    expect(at(55, 37)).toBe('low');
    expect(at(82, 64)).toBe('normal');
    expect(at(95, 80)).toBe('high');
    expect(at(38, 28)).toBe('minimum');
    // Ramping up between Low and Normal: closer to Normal.
    expect(at(70, 50)).toBe('normal');
    expect(at(0, 0)).toBe('off');
  });

  it('shows each level at 1.x’s speeds, and Maximum at the top', () => {
    const speed = (supply: number, extract: number) =>
      fanSpeed(readState({ ...UNIT_REPLY, '14000': supply, '14001': extract }));
    expect([speed(55, 37), speed(82, 64), speed(95, 80), speed(100, 90)]).toEqual([16, 50, 83, 100]);
    expect(fanSpeed(readState({ ...UNIT_REPLY, '1160': 1, '1130': 0 }))).toBe(0);
  });

  it('reads a temperature below zero', () => {
    // −10.0 °C as the unit sends it: 65536 − 100.
    expect(readState({ ...UNIT_REPLY, '12101': 65_436 }).outdoorTemperature).toBe(-10);
  });

  it('refuses a reply without a register it needs', () => {
    const { '1160': _mode, ...partial } = UNIT_REPLY;
    try {
      readState(partial);
      expect.unreachable();
    } catch (error) {
      expect(isMissingRegister(error)).toBe(true);
    }
  });

  it('leaves a mode it doesn’t know unnamed', () => {
    expect(readState({ ...UNIT_REPLY, '1160': 42 }).mode).toBeUndefined();
  });

  it('knows when the fans are stopped: Manual at Off', () => {
    expect(isStopped(readState({ ...UNIT_REPLY, '1160': 1, '1130': 0 }))).toBe(true);
    expect(isStopped(readState({ ...UNIT_REPLY, '1160': 0, '1130': 0 }))).toBe(false);
  });
});

describe('telling the unit what to do', () => {
  it('switches a mode on and changes nothing else', () => {
    // The plugin used to send the web page's whole Home form, setting 18 °C and Low with it.
    expect(modeWrite(modeById('refresh'))).toEqual({ 1161: 4 });
    expect(modeWrite(modeById('fireplace'))).toEqual({ 1161: 5 });
    expect(AUTO_WRITE).toEqual({ 1161: 1 });
  });

  it('can switch every mode HomeKit offers on, and none a wired input starts', () => {
    for (const mode of SETTABLE_MODES) expect(Object.keys(modeWrite(mode))).toEqual(['1161']);
    expect(() => modeWrite(modeById('cookerHood'))).toThrow(/can't be switched on/);
  });

  it('reads a fan speed as a level: 1.x’s 16, 50 and 83% as before, the top as Maximum', () => {
    expect([0, 1, 16, 33, 34, 50, 66, 67, 83, 91, 92, 100].map((speed) => levelForSpeed(speed).id)).toEqual([
      'off',
      'low',
      'low',
      'low',
      'normal',
      'normal',
      'normal',
      'high',
      'high',
      'high',
      'maximum',
      'maximum',
    ]);
  });

  it('runs Manual at Off, Low, Normal or High, and nothing it can’t', () => {
    expect(manualWrite(fanLevel('normal'))).toEqual({ 1130: 3, 1161: 2 });
    expect(manualWrite(fanLevel('off'))).toEqual({ 1130: 0, 1161: 2 });
    expect(() => manualWrite(fanLevel('maximum'))).toThrow(/can't run at Maximum/);
  });

  it('keeps durations in whole units within the unit’s limits', () => {
    const refresh = modeById('refresh').duration!;
    expect(durationSeconds(refresh, 35)).toBe(2100);
    expect(durationValue(refresh, 2700)).toBe(45);
    expect(durationValue(refresh, 20)).toBe(1);
    expect(durationWrite(modeById('refresh'), 45)).toEqual({ 1103: 45 });
    expect(durationWrite(modeById('fireplace'), 90)).toEqual({ 1102: 60 });
    expect(() => durationWrite(modeById('auto'), 5)).toThrow(/has no duration/);
  });

  it('turns ECO mode on and off', () => {
    expect(ecoWrite(true)).toEqual({ 2504: 1 });
    expect(ecoWrite(false)).toEqual({ 2504: 0 });
  });

  it('sets the temperature in tenths, within 12–30 °C', () => {
    expect(setpointWrite(21.5)).toEqual({ 2000: 215 });
    expect(setpointWrite(8)).toEqual({ 2000: 120 });
    expect(setpointWrite(35)).toEqual({ 2000: 300 });
  });

  it('gives every timed mode a duration register of its own', () => {
    const registers = MODES.flatMap((mode) => (mode.duration ? [mode.duration.register] : []));
    expect(new Set(registers).size).toBe(registers.length);
  });
});
