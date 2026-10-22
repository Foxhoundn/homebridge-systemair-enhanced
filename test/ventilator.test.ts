import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as hap from '@homebridge/hap-nodejs';
import type { API, Logging, Service } from 'homebridge';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TRegisterWrite } from '../src/state.js';
import { SystemairVentilator, type IVentilatorClient } from '../src/ventilator.js';
import { REFRESH_REPLY, UNIT_REPLY } from './fixtures.js';

const { Characteristic: C, Service: S } = hap;
const api = { hap, on: vi.fn() } as unknown as API;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logging;

/** The accessory on a stand-in unit that answers `reply` and records what's written. */
function ventilator(
  reply: Record<string, number> = UNIT_REPLY,
  config: Record<string, unknown> = {},
  namesFile?: string
) {
  let current = { ...reply };
  const writes: TRegisterWrite[] = [];
  const client: IVentilatorClient = {
    read: vi.fn(async () => current),
    write: vi.fn(async (values: TRegisterWrite) => {
      writes.push(values);
    }),
  };
  const accessory = new SystemairVentilator(
    log,
    { accessory: 'SystemairVentilatorEnhanced', name: 'Ventilation', ip: '192.168.68.57', ...config },
    api,
    { client, autoPoll: false, namesFile }
  );
  return {
    accessory,
    writes,
    client,
    answer: (next: Record<string, number>) => (current = { ...next }),
    service: (name: string): Service => {
      const found = accessory.getServices().find((item) => item.displayName === name);
      if (!found) throw new Error(`No service named ${name}`);
      return found;
    },
  };
}
type TCharacteristic = hap.WithUUID<new () => hap.Characteristic>;
const value = (service: Service, type: TCharacteristic) => service.getCharacteristic(type).value;
const set = (service: Service, type: TCharacteristic, next: hap.CharacteristicValue) =>
  service.getCharacteristic(type).handleSetRequest(next);

afterEach(() => {
  vi.useRealTimers();
});

describe('the ventilator in HomeKit', () => {
  it('keeps the tiles it always had, and adds a switch per mode and a timer for the short ones', () => {
    const unit = ventilator();
    const names = unit.accessory.getServices().map((service) => [service.displayName, service.subtype]);
    expect(names).toEqual([
      // Homebridge names the information tile after the accessory itself.
      ['', undefined],
      ['Ventilation Fan', undefined],
      ['Ventilation Auto', 'mode-auto'],
      ['Ventilation Visitors', 'mode-crowded'],
      // The Refresh switch keeps 1.0.6's subtype, so scenes and automations using it keep working.
      ['Ventilation Refresh', 'refresh'],
      ['Ventilation Fireplace', 'mode-fireplace'],
      ['Ventilation Away', 'mode-away'],
      ['Ventilation Holiday', 'mode-holiday'],
      ['Ventilation Refresh timer', 'timer-refresh'],
      ['Ventilation Fireplace timer', 'timer-fireplace'],
      ['Ventilation Thermostat', undefined],
      ['Ventilation Eco Mode', 'eco'],
      ['Ventilation Humidity', undefined],
      ['Ventilation Outdoor', 'outdoor'],
      ['Ventilation Filter', undefined],
    ]);
  });

  it('names every tile in the Home app, not just "Ventilation"', () => {
    const unit = ventilator();
    for (const service of unit.accessory.getServices()) {
      if (service.UUID === S.AccessoryInformation.UUID) continue;
      expect(service.getCharacteristic(C.ConfiguredName).value).toBe(service.displayName);
    }
  });

  it('keeps a name given in the Home app across a restart', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'systemair-')), 'names.json');
    const first = ventilator(UNIT_REPLY, {}, file);
    await set(first.service('Ventilation Refresh'), C.ConfiguredName, 'Air out');
    const again = ventilator(UNIT_REPLY, {}, file);
    expect(value(again.service('Ventilation Refresh'), C.ConfiguredName)).toBe('Air out');
    expect(value(again.service('Ventilation Fan'), C.ConfiguredName)).toBe('Ventilation Fan');
    // Another ventilator's names are its own.
    const other = ventilator(UNIT_REPLY, { name: 'Upstairs' }, file);
    expect(value(other.service('Upstairs Refresh'), C.ConfiguredName)).toBe('Upstairs Refresh');
  });

  it('shows what the unit is doing once it has read it', async () => {
    const unit = ventilator();
    await unit.accessory.poll();
    const fan = unit.service('Ventilation Fan');
    expect(value(fan, C.Active)).toBe(C.Active.ACTIVE);
    // Auto runs the fans at Low: 1.x's 16%.
    expect(value(fan, C.RotationSpeed)).toBe(16);
    expect(value(fan, C.TargetFanState)).toBe(C.TargetFanState.AUTO);
    expect(value(unit.service('Ventilation Auto'), C.On)).toBe(true);
    expect(value(unit.service('Ventilation Refresh'), C.On)).toBe(false);
    const thermostat = unit.service('Ventilation Thermostat');
    expect(value(thermostat, C.CurrentTemperature)).toBeCloseTo(22.4);
    expect(value(thermostat, C.TargetTemperature)).toBe(22);
    expect(value(unit.service('Ventilation Humidity'), C.CurrentRelativeHumidity)).toBe(46);
    expect(value(unit.service('Ventilation Outdoor'), C.CurrentTemperature)).toBeCloseTo(10.1);
    expect(value(unit.service('Ventilation Filter'), C.FilterLifeLevel)).toBe(44);
    expect(value(unit.service('Ventilation Refresh timer'), C.SetDuration)).toBe(35 * 60);
  });

  it('shows Refresh as running, at Maximum (not the manual setting’s 16%), counting down', async () => {
    const unit = ventilator(REFRESH_REPLY);
    await unit.accessory.poll();
    expect(value(unit.service('Ventilation Fan'), C.RotationSpeed)).toBe(100);
    expect(value(unit.service('Ventilation Refresh'), C.On)).toBe(true);
    expect(value(unit.service('Ventilation Auto'), C.On)).toBe(false);
    const timer = unit.service('Ventilation Refresh timer');
    expect(value(timer, C.Active)).toBe(C.Active.ACTIVE);
    expect(value(timer, C.InUse)).toBe(C.InUse.IN_USE);
    expect(value(timer, C.RemainingDuration)).toBe(1800);
  });

  it('starts Refresh from its switch and changes nothing else', async () => {
    vi.useFakeTimers();
    const unit = ventilator();
    await unit.accessory.poll();
    await set(unit.service('Ventilation Refresh'), C.On, true);
    expect(unit.writes).toEqual([{ 1161: 4 }]);
    // Only one mode is on at a time, at once.
    expect(value(unit.service('Ventilation Auto'), C.On)).toBe(false);
    expect(value(unit.service('Ventilation Refresh'), C.On)).toBe(true);
    // Then it's read back from the unit.
    unit.answer(REFRESH_REPLY);
    await vi.advanceTimersByTimeAsync(1500);
    expect(unit.client.read).toHaveBeenCalledTimes(2);
    expect(value(unit.service('Ventilation Refresh timer'), C.RemainingDuration)).toBe(1800);
  });

  it('goes back to Auto when the mode that’s on is turned off, and ignores turning off one that isn’t', async () => {
    const unit = ventilator(REFRESH_REPLY);
    await unit.accessory.poll();
    await set(unit.service('Ventilation Fireplace'), C.On, false);
    expect(unit.writes).toEqual([]);
    await set(unit.service('Ventilation Refresh'), C.On, false);
    expect(unit.writes).toEqual([{ 1161: 1 }]);
  });

  it('goes back to Manual at High when Refresh interrupted it, however Refresh was started', async () => {
    const unit = ventilator({ ...UNIT_REPLY, '1160': 1, '1130': 4, '14000': 95, '14001': 80 });
    await unit.accessory.poll();
    // Refresh started from the unit's own panel, then turned off from HomeKit.
    unit.answer({ ...REFRESH_REPLY, '1130': 4 });
    await unit.accessory.poll();
    await set(unit.service('Ventilation Refresh timer'), C.Active, C.Active.INACTIVE);
    expect(unit.writes).toEqual([{ 1130: 4, 1161: 2 }]);
    expect(value(unit.service('Ventilation Fan'), C.TargetFanState)).toBe(C.TargetFanState.MANUAL);
  });

  it('sets how long Refresh lasts from its timer’s duration, in whole minutes', async () => {
    const unit = ventilator();
    await unit.accessory.poll();
    const timer = unit.service('Ventilation Refresh timer');
    await set(timer, C.SetDuration, 45 * 60);
    expect(unit.writes).toEqual([{ 1103: 45 }]);
    expect(value(timer, C.SetDuration)).toBe(45 * 60);
    await set(timer, C.Active, C.Active.ACTIVE);
    expect(unit.writes.at(-1)).toEqual({ 1161: 4 });
  });

  it('sets a fan speed as Manual at a level, once the slider settles', async () => {
    vi.useFakeTimers();
    const unit = ventilator();
    await unit.accessory.poll();
    const fan = unit.service('Ventilation Fan');
    await set(fan, C.RotationSpeed, 20);
    await set(fan, C.RotationSpeed, 40);
    await set(fan, C.RotationSpeed, 50);
    expect(unit.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(400);
    expect(unit.writes).toEqual([{ 1130: 3, 1161: 2 }]);
    expect(value(fan, C.RotationSpeed)).toBe(50);
  });

  it('starts Refresh at the top of the slider, the only way to Maximum', async () => {
    vi.useFakeTimers();
    const unit = ventilator();
    await unit.accessory.poll();
    const fan = unit.service('Ventilation Fan');
    await set(fan, C.RotationSpeed, 100);
    await vi.advanceTimersByTimeAsync(400);
    expect(unit.writes).toEqual([{ 1161: 4 }]);
    expect(value(fan, C.RotationSpeed)).toBe(100);
    expect(value(unit.service('Ventilation Refresh'), C.On)).toBe(true);
    // Just below it is High.
    await set(fan, C.RotationSpeed, 85);
    await vi.advanceTimersByTimeAsync(400);
    expect(unit.writes.at(-1)).toEqual({ 1130: 4, 1161: 2 });
  });

  it('stops the fans only where the unit allows it', async () => {
    const allowed = ventilator();
    await allowed.accessory.poll();
    await set(allowed.service('Ventilation Fan'), C.Active, C.Active.INACTIVE);
    expect(allowed.writes).toEqual([{ 1130: 0, 1161: 2 }]);

    const refused = ventilator({ ...UNIT_REPLY, '1352': 0 });
    await refused.accessory.poll();
    await expect(
      set(refused.service('Ventilation Fan'), C.Active, C.Active.INACTIVE)
    ).rejects.toBe(hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);
    expect(refused.writes).toEqual([]);
  });

  it('turns ECO mode on and off, as 1.0.6 did', async () => {
    const unit = ventilator();
    await unit.accessory.poll();
    const eco = unit.service('Ventilation Eco Mode');
    expect(value(eco, C.On)).toBe(false);
    await set(eco, C.On, true);
    expect(unit.writes).toEqual([{ 2504: 1 }]);
    expect(value(eco, C.On)).toBe(true);
  });

  it('heats while the house is below the setpoint, and takes Heat or Cool from a scene', async () => {
    const unit = ventilator({ ...UNIT_REPLY, '12543': 205 });
    await unit.accessory.poll();
    const thermostat = unit.service('Ventilation Thermostat');
    expect(value(thermostat, C.CurrentHeatingCoolingState)).toBe(C.CurrentHeatingCoolingState.HEAT);
    // Already running: Heat changes nothing on the unit.
    await set(thermostat, C.TargetHeatingCoolingState, C.TargetHeatingCoolingState.HEAT);
    expect(unit.writes).toEqual([]);
  });

  it('sets the temperature in the unit’s range', async () => {
    const unit = ventilator();
    await unit.accessory.poll();
    await set(unit.service('Ventilation Thermostat'), C.TargetTemperature, 21.5);
    expect(unit.writes).toEqual([{ 2000: 215 }]);
  });

  it('says "No Response" until the unit has answered, and after it stops answering', async () => {
    const unit = ventilator();
    const speed = unit.service('Ventilation Fan').getCharacteristic(C.RotationSpeed);
    await expect(speed.handleGetRequest()).rejects.toBe(hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    await unit.accessory.poll();
    await expect(speed.handleGetRequest()).resolves.toBe(16);
    vi.mocked(unit.client.read).mockRejectedValue(new Error('timeout'));
    await unit.accessory.poll();
    // One missed read keeps the last values…
    await expect(speed.handleGetRequest()).resolves.toBe(16);
    await unit.accessory.poll();
    await unit.accessory.poll();
    // …three in a row don't.
    await expect(speed.handleGetRequest()).rejects.toBe(hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  });

  it('takes the modes, timers and names from the settings', () => {
    const unit = ventilator(UNIT_REPLY, {
      modeSwitches: ['refresh', 'crowded'],
      timers: [],
      modeNames: { crowded: 'Guests' },
      outdoorTemperature: false,
      filter: false,
      eco: false,
    });
    const names = unit.accessory.getServices().map((service) => service.displayName);
    expect(names).toContain('Ventilation Guests');
    expect(names).toContain('Ventilation Refresh');
    expect(names).not.toContain('Ventilation Auto');
    expect(names.some((name) => name.endsWith('timer'))).toBe(false);
    expect(names).not.toContain('Ventilation Outdoor');
    expect(names).not.toContain('Ventilation Filter');
    expect(names).not.toContain('Ventilation Eco Mode');
    expect(unit.accessory.getServices().some((service) => service.UUID === S.Valve.UUID)).toBe(false);
  });
});
