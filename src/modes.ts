export type TModeId =
  | 'auto'
  | 'manual'
  | 'crowded'
  | 'refresh'
  | 'fireplace'
  | 'away'
  | 'holiday'
  | 'cookerHood'
  | 'vacuumCleaner';
export type TDurationUnit = 'minutes' | 'hours' | 'days';

/** How long a timed mode lasts, as the unit keeps it (register 1100–1104, in `unit`). */
export interface IModeDuration {
  register: number;
  unit: TDurationUnit;
  min: number;
  max: number;
}

export interface IMode {
  id: TModeId;
  /** What the unit calls it. */
  name: string;
  /** Its value in the current-mode register (1160). */
  current: number;
  /** Its value in the mode-change register (1161); absent for a mode only a wired input starts. */
  request?: number;
  duration?: IModeDuration;
}

/**
 * The unit's modes. Requests and durations are the web page's own (its mode menu and timer
 * pop-up); Cooker hood and Vacuum cleaner come from Systemair's Modbus list: they're started by
 * switches wired to the unit, so they can be seen but not set.
 */
export const MODES: readonly IMode[] = [
  { id: 'auto', name: 'Auto', current: 0, request: 1 },
  { id: 'manual', name: 'Manual', current: 1, request: 2 },
  {
    id: 'crowded',
    name: 'Crowded',
    current: 2,
    request: 3,
    duration: { register: 1104, unit: 'hours', min: 1, max: 8 },
  },
  {
    id: 'refresh',
    name: 'Refresh',
    current: 3,
    request: 4,
    duration: { register: 1103, unit: 'minutes', min: 1, max: 240 },
  },
  {
    id: 'fireplace',
    name: 'Fireplace',
    current: 4,
    request: 5,
    duration: { register: 1102, unit: 'minutes', min: 1, max: 60 },
  },
  {
    id: 'away',
    name: 'Away',
    current: 5,
    request: 6,
    duration: { register: 1101, unit: 'hours', min: 1, max: 72 },
  },
  {
    id: 'holiday',
    name: 'Holiday',
    current: 6,
    request: 7,
    duration: { register: 1100, unit: 'days', min: 1, max: 365 },
  },
  { id: 'cookerHood', name: 'Cooker hood', current: 7 },
  { id: 'vacuumCleaner', name: 'Vacuum cleaner', current: 8 },
];

export function modeById(id: TModeId): IMode {
  const mode = MODES.find((item) => item.id === id);
  if (!mode) throw new Error(`Unknown mode ${id}`);
  return mode;
}

export function modeByCurrent(value: number): IMode | undefined {
  return MODES.find((mode) => mode.current === value);
}

/** The modes HomeKit can switch on (everything but those only a wired input starts). */
export const SETTABLE_MODES: readonly IMode[] = MODES.filter((mode) => mode.request !== undefined);

const UNIT_SECONDS: Readonly<Record<TDurationUnit, number>> = {
  minutes: 60,
  hours: 3600,
  days: 86_400,
};

/** A duration in the unit's own terms (35 minutes) as seconds. */
export function durationSeconds(duration: IModeDuration, value: number): number {
  return value * UNIT_SECONDS[duration.unit];
}

/** Seconds as the unit keeps the duration: whole minutes, hours or days, within its limits. */
export function durationValue(duration: IModeDuration, seconds: number): number {
  const value = Math.round(seconds / UNIT_SECONDS[duration.unit]);
  return Math.min(duration.max, Math.max(duration.min, value));
}
