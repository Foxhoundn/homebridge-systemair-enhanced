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

/** Manual mode's airflow levels (register 1130). */
export const MANUAL_LEVEL = { off: 0, low: 2, normal: 3, high: 4 } as const;
export type TManualLevel = (typeof MANUAL_LEVEL)[keyof typeof MANUAL_LEVEL];

/** The unit's setpoint range, °C. */
export const SETPOINT_RANGE = { min: 12, max: 30 } as const;
