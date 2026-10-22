import type { API } from 'homebridge';
import { SystemairVentilator } from './ventilator.js';

/** The accessory's name in Homebridge's config (`"accessory": "SystemairVentilatorEnhanced"`). */
const ACCESSORY_NAME = 'SystemairVentilatorEnhanced';

export = (api: API): void => {
  api.registerAccessory(ACCESSORY_NAME, SystemairVentilator);
};
