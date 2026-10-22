/**
 * Systemair SAVE Connect registers, as the unit's own web page uses them (its `scripts.js`):
 * `GET /mread?{"1160":1}` reads (register → how many registers), `GET /mwrite?{"1161":4}` writes.
 * Temperatures are tenths of a degree; a time split over two registers is seconds (low, high).
 */
export const REGISTER = {
  /** Write to change the mode: see `MODES[].request`. */
  modeRequest: 1161,
  /** The mode it's in now: see `MODES[].current`. */
  modeCurrent: 1160,
  /** Manual mode's airflow: 0 off, 2 low, 3 normal, 4 high. */
  manualLevel: 1130,
  /** Time left in a timed mode, seconds (with 1111). */
  remaining: 1110,
  /** Whether Manual may stop the fans altogether (1 yes). */
  manualStopAllowed: 1352,
  /** What the fans actually run at, percent. */
  supplyFanOutput: 14000,
  extractFanOutput: 14001,
  /** Each airflow level's supply and extract percentages, Minimum to Maximum (1400–1409). */
  fanLevelPercents: 1400,
  /** Extract air temperature (what the house is at), tenths of °C. */
  extractTemperature: 12543,
  outdoorTemperature: 12101,
  supplyTemperature: 12102,
  /** Temperature setpoint, tenths of °C (12–30 °C on the unit). */
  setpoint: 2000,
  /** Relative humidity, percent. */
  humidity: 12135,
  /** ECO mode: 1 on. */
  eco: 2504,
  /** How often the filter is changed, months. */
  filterPeriod: 7000,
  /** Time left until the filter change, seconds (with 7005). */
  filterRemaining: 7004,
} as const;

export type TFanLevel = 'off' | 'minimum' | 'low' | 'normal' | 'high' | 'maximum';
export interface IFanLevel {
  id: TFanLevel;
  name: string;
  /** Its value in the unit's level settings (and Manual's, register 1130). */
  value: number;
  /** The fan speed HomeKit shows for it: 1.x's 16, 50 and 83%, and Maximum at the top. */
  speed: number;
  /** Where its supply percentage is set (its extract percentage is the next register). */
  supplyRegister?: number;
  /** Manual mode can run at it (Off, Low, Normal, High); the rest only modes reach. */
  manual: boolean;
}

/** The unit's airflow levels, lowest first. */
export const FAN_LEVELS: readonly IFanLevel[] = [
  { id: 'off', name: 'Off', value: 0, speed: 0, manual: true },
  { id: 'minimum', name: 'Minimum', value: 1, speed: 8, supplyRegister: 1400, manual: false },
  { id: 'low', name: 'Low', value: 2, speed: 16, supplyRegister: 1402, manual: true },
  { id: 'normal', name: 'Normal', value: 3, speed: 50, supplyRegister: 1404, manual: true },
  { id: 'high', name: 'High', value: 4, speed: 83, supplyRegister: 1406, manual: true },
  { id: 'maximum', name: 'Maximum', value: 5, speed: 100, supplyRegister: 1408, manual: false },
];

export function fanLevel(id: TFanLevel): IFanLevel {
  const level = FAN_LEVELS.find((item) => item.id === id);
  if (!level) throw new Error(`Unknown fan level ${id}`);
  return level;
}

/** The unit's setpoint range, °C. */
export const SETPOINT_RANGE = { min: 12, max: 30 } as const;
