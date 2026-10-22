import { MODES, modeByCurrent, type IMode, type TModeId } from './modes.js';
import {
  FAN_LEVELS,
  fanLevel,
  REGISTER,
  SETPOINT_RANGE,
  type IFanLevel,
  type TFanLevel,
} from './registers.js';

/** Register values as the unit returns them: `{"1160": 3, …}`. */
export type TRegisterValues = Readonly<Record<string, number>>;
/** Registers to write: `{ 1161: 4 }`. */
export type TRegisterWrite = Readonly<Record<number, number>>;

/** Everything HomeKit shows, read in one request (register → how many registers). */
export const POLL_REGISTERS: Readonly<Record<number, number>> = {
  [REGISTER.modeCurrent]: 1,
  [REGISTER.manualLevel]: 1,
  [REGISTER.remaining]: 2,
  [REGISTER.manualStopAllowed]: 1,
  [REGISTER.supplyFanOutput]: 2,
  [REGISTER.fanLevelPercents]: 10,
  [REGISTER.extractTemperature]: 1,
  [REGISTER.outdoorTemperature]: 1,
  [REGISTER.setpoint]: 1,
  [REGISTER.humidity]: 1,
  [REGISTER.eco]: 1,
  [REGISTER.filterPeriod]: 1,
  [REGISTER.filterRemaining]: 2,
  ...Object.fromEntries(
    MODES.flatMap((mode) => (mode.duration ? [[mode.duration.register, 1]] : []))
  ),
};

export interface IVentilatorState {
  /** The mode it's in; undefined for a value this plugin doesn't know. */
  mode?: TModeId;
  /** Time left in a timed mode, seconds (0 when none is running). */
  remainingSeconds: number;
  manualLevel: number;
  manualStopAllowed: boolean;
  /** What the fans run at now, percent. */
  supplyFanPercent: number;
  extractFanPercent: number;
  /** The airflow level that is: the one whose set percentages are closest. */
  fanLevel: TFanLevel;
  /** °C */
  extractTemperature: number;
  outdoorTemperature: number;
  setpoint: number;
  /** Percent. */
  humidity: number;
  eco: boolean;
  filterPeriodMonths: number;
  filterRemainingSeconds: number;
  /** Each timed mode's duration, in its own unit (Refresh 35 minutes, Away 8 hours). */
  durations: Partial<Record<TModeId, number>>;
}

class MissingRegisterError extends Error {}

/** One register's value; a reply without it isn't a reading. */
function value(values: TRegisterValues, register: number): number {
  const read = values[String(register)];
  if (typeof read !== 'number' || !Number.isFinite(read))
    throw new MissingRegisterError(`The unit didn't return register ${register}`);
  return read;
}
/** A signed 16-bit register: an outdoor temperature can be below zero. */
const signed = (raw: number): number => (raw > 32_767 ? raw - 65_536 : raw);
/** Two registers, low then high, as one number. */
const long = (values: TRegisterValues, register: number): number =>
  value(values, register + 1) * 65_536 + value(values, register);
const tenths = (raw: number): number => signed(raw) / 10;

/**
 * The level the fans run at, from their outputs and each level's set percentages: Auto picks its
 * level itself, and no register says which it picked.
 */
export function levelOf(values: TRegisterValues, supply: number, extract: number): TFanLevel {
  if (supply <= 0 && extract <= 0) return 'off';
  let best: { id: TFanLevel; distance: number } = { id: 'off', distance: Infinity };
  for (const level of FAN_LEVELS) {
    if (level.supplyRegister === undefined) continue;
    const distance =
      Math.abs(value(values, level.supplyRegister) - supply) +
      Math.abs(value(values, level.supplyRegister + 1) - extract);
    if (distance < best.distance) best = { id: level.id, distance };
  }
  return best.id;
}

/** What the unit is doing, from one read of `POLL_REGISTERS`. */
export function readState(values: TRegisterValues): IVentilatorState {
  const supply = value(values, REGISTER.supplyFanOutput);
  const extract = value(values, REGISTER.extractFanOutput);
  return {
    mode: modeByCurrent(value(values, REGISTER.modeCurrent))?.id,
    remainingSeconds: long(values, REGISTER.remaining),
    manualLevel: value(values, REGISTER.manualLevel),
    manualStopAllowed: value(values, REGISTER.manualStopAllowed) === 1,
    supplyFanPercent: supply,
    extractFanPercent: extract,
    fanLevel: levelOf(values, supply, extract),
    extractTemperature: tenths(value(values, REGISTER.extractTemperature)),
    outdoorTemperature: tenths(value(values, REGISTER.outdoorTemperature)),
    setpoint: tenths(value(values, REGISTER.setpoint)),
    humidity: value(values, REGISTER.humidity),
    eco: value(values, REGISTER.eco) === 1,
    filterPeriodMonths: value(values, REGISTER.filterPeriod),
    filterRemainingSeconds: long(values, REGISTER.filterRemaining),
    durations: Object.fromEntries(
      MODES.flatMap((mode) =>
        mode.duration ? [[mode.id, value(values, mode.duration.register)]] : []
      )
    ),
  };
}

export function isMissingRegister(error: unknown): boolean {
  return error instanceof MissingRegisterError;
}

/** The fans are stopped: Manual mode at Off. */
export function isStopped(state: IVentilatorState): boolean {
  return state.mode === 'manual' && state.manualLevel === fanLevel('off').value;
}

/** How much filter life is left, percent of its change period. */
export function filterLifePercent(state: IVentilatorState): number {
  const period = state.filterPeriodMonths * 30 * 86_400;
  if (period <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (state.filterRemainingSeconds / period) * 100)));
}

/** The speed HomeKit shows: the level's (Low 16%, Normal 50%, High 83%, Maximum 100%). */
export function fanSpeed(state: IVentilatorState): number {
  return isStopped(state) ? 0 : fanLevel(state.fanLevel).speed;
}

/**
 * The level a HomeKit fan speed asks for: halfway between two levels' speeds is the line, so a
 * scene's 16, 50 or 83% is Low, Normal or High as in 1.x, and the top of the slider is Maximum.
 */
export function levelForSpeed(percent: number): IFanLevel {
  if (percent <= 0) return fanLevel('off');
  if (percent <= 33) return fanLevel('low');
  if (percent <= 66) return fanLevel('normal');
  if (percent <= 91) return fanLevel('high');
  return fanLevel('maximum');
}

/** Back to Auto: the unit's own schedule and demand control. */
export const AUTO_WRITE: TRegisterWrite = { [REGISTER.modeRequest]: modeRequest('auto') };

function modeRequest(id: TModeId): number {
  const request = MODES.find((mode) => mode.id === id)?.request;
  if (request === undefined) throw new Error(`${id} can't be switched on over the network`);
  return request;
}

/** Auto, or Manual at a level: what a timed mode interrupts, and what turning it off brings back. */
export interface ISteadyMode {
  mode: 'auto' | 'manual';
  manualLevel: number;
}

/** The steady mode the unit is in, if it's in one (not in Refresh, Away…). */
export function steadyOf(state: IVentilatorState): ISteadyMode | undefined {
  return state.mode === 'auto' || state.mode === 'manual'
    ? { mode: state.mode, manualLevel: state.manualLevel }
    : undefined;
}

/** Back to a steady mode: Auto, or Manual at its level. */
export function steadyWrite(steady: ISteadyMode): TRegisterWrite {
  if (steady.mode === 'auto') return AUTO_WRITE;
  return {
    [REGISTER.manualLevel]: steady.manualLevel,
    [REGISTER.modeRequest]: modeRequest('manual'),
  };
}

/** Manual mode at a level it can run at (Off stops the fans). */
export function manualWrite(level: IFanLevel): TRegisterWrite {
  if (!level.manual) throw new Error(`Manual mode can't run at ${level.name}`);
  return {
    [REGISTER.manualLevel]: level.value,
    [REGISTER.modeRequest]: modeRequest('manual'),
  };
}

/**
 * Switches a mode on. Only the mode: the unit's web page sends its whole Home form when you
 * change mode, and copying that (as this plugin once did) also reset the setpoint to 18 °C.
 */
export function modeWrite(mode: IMode): TRegisterWrite {
  return { [REGISTER.modeRequest]: modeRequest(mode.id) };
}

/** A timed mode's duration, in its own unit (whole minutes, hours or days). */
export function durationWrite(mode: IMode, value: number): TRegisterWrite {
  if (!mode.duration) throw new Error(`${mode.name} has no duration`);
  const clamped = Math.min(mode.duration.max, Math.max(mode.duration.min, Math.round(value)));
  return { [mode.duration.register]: clamped };
}

/** ECO mode on or off. */
export function ecoWrite(on: boolean): TRegisterWrite {
  return { [REGISTER.eco]: on ? 1 : 0 };
}

/** The setpoint, in tenths of a degree, within the unit's range. */
export function setpointWrite(celsius: number): TRegisterWrite {
  const clamped = Math.min(SETPOINT_RANGE.max, Math.max(SETPOINT_RANGE.min, celsius));
  return { [REGISTER.setpoint]: Math.round(clamped * 10) };
}
