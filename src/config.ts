import { MODES, SETTABLE_MODES, type TModeId } from './modes.js';

export interface IVentilatorConfig {
  /** The accessory's name in HomeKit ("Ventilation"); each tile is named after it. */
  name: string;
  /** The SAVE Connect module's address. */
  ip: string;
  /** How often the unit is read. */
  pollSeconds: number;
  /** The modes shown as switches, for scenes and automations. */
  modeSwitches: readonly TModeId[];
  /**
   * Timed modes also shown as a valve: the Home app's Duration picker sets how long the mode
   * lasts, and the valve counts down while it runs. Up to an hour (HomeKit's limit).
   */
  timers: readonly TModeId[];
  /** Other names for the modes' tiles: { crowded: "Visitors" }. */
  modeNames: Partial<Record<TModeId, string>>;
  outdoorTemperature: boolean;
  filter: boolean;
}

export const DEFAULT_MODE_SWITCHES: readonly TModeId[] = [
  'auto',
  'crowded',
  'refresh',
  'fireplace',
  'away',
  'holiday',
];
export const DEFAULT_TIMERS: readonly TModeId[] = ['refresh', 'fireplace'];
/** The Home app counts a valve's duration down from at most an hour. */
export const TIMER_MAX_SECONDS = 3600;
const MIN_POLL_SECONDS = 5;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function modeList(value: unknown, allowed: readonly TModeId[], fallback: readonly TModeId[]) {
  if (!Array.isArray(value)) return fallback;
  return allowed.filter((id) => value.includes(id));
}

/** The plugin's settings from Homebridge's config, with defaults for what's left out. */
export function readConfig(raw: unknown): IVentilatorConfig {
  const config = isRecord(raw) ? raw : {};
  const ip = typeof config.ip === 'string' ? config.ip.trim() : '';
  if (!ip) throw new Error('Set "ip" to the SAVE Connect module\'s address in the plugin settings');
  const poll = Number(config.pollSeconds);
  const names = isRecord(config.modeNames) ? config.modeNames : {};
  const settable = SETTABLE_MODES.map((mode) => mode.id).filter((id) => id !== 'manual');
  const timed = MODES.filter((mode) => mode.duration?.unit === 'minutes').map((mode) => mode.id);
  return {
    name: typeof config.name === 'string' && config.name.trim() ? config.name.trim() : 'Ventilation',
    ip,
    pollSeconds: Number.isFinite(poll) && poll >= MIN_POLL_SECONDS ? poll : 10,
    modeSwitches: modeList(config.modeSwitches, settable, DEFAULT_MODE_SWITCHES),
    timers: modeList(config.timers, timed, DEFAULT_TIMERS),
    modeNames: Object.fromEntries(
      MODES.flatMap((mode) => {
        const name = names[mode.id];
        return typeof name === 'string' && name.trim() ? [[mode.id, name.trim()]] : [];
      })
    ),
    outdoorTemperature: config.outdoorTemperature !== false,
    filter: config.filter !== false,
  };
}
