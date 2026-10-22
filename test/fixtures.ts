import { POLL_REGISTERS } from '../src/state.js';

/**
 * A real reply from a SAVE unit (2026-10-22, Filip's): Auto, Low as the manual level, the supply
 * fan at 55%, 22.4 °C inside and 10.1 °C outside, setpoint 22 °C, 46% humidity, the filter
 * 2.6 of its 6 months from a change, Refresh set to 35 minutes.
 */
export const UNIT_REPLY: Readonly<Record<string, number>> = {
  '1100': 14,
  '1101': 8,
  '1102': 45,
  '1103': 35,
  '1104': 6,
  '1110': 0,
  '1111': 0,
  '1130': 2,
  '1160': 0,
  '1352': 1,
  '2000': 220,
  '2504': 0,
  '7000': 6,
  '7004': 61_763,
  '7005': 103,
  '12101': 101,
  '12135': 46,
  '12543': 224,
  '14000': 55,
  '14001': 37,
};

/** The same unit 5 minutes into a 35-minute Refresh, both fans at maximum. */
export const REFRESH_REPLY: Readonly<Record<string, number>> = {
  ...UNIT_REPLY,
  '1160': 3,
  '1110': 1800,
  '14000': 100,
  '14001': 100,
};

/** Every register the plugin reads, so a reply missing one is noticed here first. */
export const POLLED = Object.entries(POLL_REGISTERS).flatMap(([register, count]) =>
  Array.from({ length: count }, (_, index) => String(Number(register) + index))
);
