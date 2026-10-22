import type {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  Characteristic,
  CharacteristicValue,
  Logging,
  Service,
  WithUUID,
} from 'homebridge';
import { readConfig, TIMER_MAX_SECONDS, type IVentilatorConfig } from './config.js';
import {
  durationSeconds,
  durationValue,
  modeById,
  type IMode,
  type IModeDuration,
  type TModeId,
} from './modes.js';
import { SETPOINT_RANGE, type TManualLevel } from './registers.js';
import { SaveConnect } from './saveConnect.js';
import {
  AUTO_WRITE,
  durationWrite,
  filterLifePercent,
  isStopped,
  levelForSpeed,
  modeWrite,
  POLL_REGISTERS,
  readState,
  setpointWrite,
  speedWrite,
  type IVentilatorState,
  type TRegisterValues,
  type TRegisterWrite,
} from './state.js';

/** What the accessory needs from the unit (a `SaveConnect`, or a stand-in in tests). */
export interface IVentilatorClient {
  read(registers: Readonly<Record<number, number>>): Promise<TRegisterValues>;
  write(values: TRegisterWrite): Promise<void>;
}

export interface IVentilatorOptions {
  client?: IVentilatorClient;
  /** Start reading the unit on a timer (off in tests, which call `poll` themselves). */
  autoPoll?: boolean;
}

type TCharacteristic = WithUUID<new () => Characteristic>;
/** A characteristic's value, worked out from the state (undefined: nothing to show yet). */
type TReader = (state: IVentilatorState) => CharacteristicValue;

const LEVEL_WORDS: Readonly<Record<TManualLevel, string>> = {
  0: 'Off',
  2: 'Low',
  3: 'Normal',
  4: 'High',
};

/** After this many failed reads in a row, the tiles say "No Response" rather than old values. */
const STALE_AFTER_FAILURES = 3;
/** A change takes the unit a moment to apply; read it back after this. */
const READ_BACK_MS = 1500;
/** The Home app sends a fan speed many times while you drag; only the last one is written. */
const SPEED_SETTLE_MS = 400;

/**
 * A Systemair SAVE unit as one HomeKit accessory: the fan (its real speed, Auto or a manual
 * level), a switch per mode for scenes, a valve per short timed mode for its duration and
 * countdown, the thermostat, humidity, outdoor temperature and the filter. The unit is read in
 * one request every `pollSeconds`, and HomeKit is told about each change.
 */
export class SystemairVentilator implements AccessoryPlugin {
  private readonly config: IVentilatorConfig;
  private readonly client: IVentilatorClient;
  private readonly services: Service[] = [];
  private readonly readers: Array<{ service: Service; type: TCharacteristic; read: TReader }> = [];
  private state?: IVentilatorState;
  private failures = 0;
  private timer?: ReturnType<typeof setInterval>;
  private readBack?: ReturnType<typeof setTimeout>;
  private speed?: { percent: number; timer: ReturnType<typeof setTimeout> };

  public constructor(
    private readonly log: Logging,
    rawConfig: AccessoryConfig,
    private readonly api: API,
    options: IVentilatorOptions = {}
  ) {
    this.config = readConfig(rawConfig);
    this.client = options.client ?? new SaveConnect({ host: this.config.ip });
    this.build();
    if (options.autoPoll !== false) {
      void this.poll();
      this.timer = setInterval(() => void this.poll(), this.config.pollSeconds * 1000);
      api.on('shutdown', () => this.stop());
    }
  }

  public getServices(): Service[] {
    return this.services;
  }

  /** Stops reading the unit (Homebridge shutting down). */
  public stop(): void {
    clearInterval(this.timer);
    clearTimeout(this.readBack);
    if (this.speed) clearTimeout(this.speed.timer);
  }

  /** Reads the unit once and tells HomeKit what changed. */
  public async poll(): Promise<void> {
    try {
      const state = readState(await this.client.read(POLL_REGISTERS));
      if (!this.state || this.failures)
        this.log.info(
          `Reading the unit at ${this.config.ip}: ${this.modeName(state.mode)}, supply fan at ${state.supplyFanPercent}%`
        );
      this.failures = 0;
      this.state = state;
      this.push();
    } catch (error) {
      this.failures += 1;
      if (this.failures === 1 || this.failures === STALE_AFTER_FAILURES)
        this.log.warn(`Couldn't read the unit: ${(error as Error).message}`);
    }
  }

  private modeName(id: TModeId | undefined): string {
    if (!id) return 'an unknown mode';
    return this.config.modeNames[id] ?? modeById(id).name;
  }

  private get hap() {
    return this.api.hap;
  }

  /** The state, or "No Response" when there's none to trust. */
  private current(): IVentilatorState {
    if (!this.state || this.failures >= STALE_AFTER_FAILURES)
      throw new this.hap.HapStatusError(this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    return this.state;
  }

  /** Each characteristic shown from the state: answered from it, and told when it changes. */
  private show(service: Service, type: TCharacteristic, read: TReader): void {
    this.readers.push({ service, type, read });
    service.getCharacteristic(type).onGet(() => read(this.current()));
  }

  private push(): void {
    const state = this.state;
    if (!state) return;
    for (const { service, type, read } of this.readers) {
      const characteristic = service.getCharacteristic(type);
      const next = read(state);
      if (characteristic.value !== next) characteristic.updateValue(next);
    }
  }

  /** Writes to the unit, then reads it back once it has applied the change. */
  private async send(write: TRegisterWrite, what: string): Promise<void> {
    try {
      await this.client.write(write);
      this.log.info(what);
    } catch (error) {
      this.log.error(`Couldn't ${what.charAt(0).toLowerCase()}${what.slice(1)}: ${(error as Error).message}`);
      throw new this.hap.HapStatusError(this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    clearTimeout(this.readBack);
    this.readBack = setTimeout(() => void this.poll(), READ_BACK_MS);
  }

  /** Shows a change at once, before the unit is read back. */
  private assume(change: Partial<IVentilatorState>): void {
    if (!this.state) return;
    this.state = { ...this.state, ...change };
    this.push();
  }

  private build(): void {
    const { Service: S, Characteristic: C } = this.hap;
    const name = this.config.name;

    const info = new S.AccessoryInformation();
    info
      .setCharacteristic(C.Manufacturer, 'Systemair')
      .setCharacteristic(C.Model, 'SAVE Connect')
      .setCharacteristic(C.SerialNumber, this.config.ip);
    this.services.push(info);

    this.buildFan(name);
    this.buildModes(name);
    this.buildTimers(name);
    this.buildThermostat(name);

    const humidity = new S.HumiditySensor(`${name} Humidity`);
    this.show(humidity, C.CurrentRelativeHumidity, (state) => clamp(state.humidity, 0, 100));
    this.services.push(humidity);

    if (this.config.outdoorTemperature) {
      const outdoor = new S.TemperatureSensor(`${name} Outdoor`, 'outdoor');
      outdoor.getCharacteristic(C.CurrentTemperature).setProps({ minValue: -50, maxValue: 60 });
      this.show(outdoor, C.CurrentTemperature, (state) => state.outdoorTemperature);
      this.services.push(outdoor);
    }

    if (this.config.filter) {
      const filter = new S.FilterMaintenance(`${name} Filter`);
      this.show(filter, C.FilterLifeLevel, (state) => filterLifePercent(state));
      this.show(filter, C.FilterChangeIndication, (state) =>
        filterLifePercent(state) <= 0
          ? C.FilterChangeIndication.CHANGE_FILTER
          : C.FilterChangeIndication.FILTER_OK
      );
      this.services.push(filter);
    }
  }

  private buildFan(name: string): void {
    const { Service: S, Characteristic: C } = this.hap;
    const fan = new S.Fanv2(`${name} Fan`);
    this.show(fan, C.Active, (state) =>
      isStopped(state) ? C.Active.INACTIVE : C.Active.ACTIVE
    );
    // What the supply fan actually runs at: Refresh at Maximum shows near 100%, not Low's 16%.
    this.show(fan, C.RotationSpeed, (state) =>
      isStopped(state) ? 0 : clamp(state.supplyFanPercent, 0, 100)
    );
    this.show(fan, C.TargetFanState, (state) =>
      state.mode === 'auto' ? C.TargetFanState.AUTO : C.TargetFanState.MANUAL
    );
    fan.getCharacteristic(C.Active).onSet(async (value) => {
      const state = this.current();
      if (value === C.Active.INACTIVE) {
        if (isStopped(state)) return;
        await this.stopFans(state);
      } else if (isStopped(state)) {
        await this.send(AUTO_WRITE, 'Back to Auto');
        this.assume({ mode: 'auto' });
      }
    });
    fan.getCharacteristic(C.RotationSpeed).onSet((value) => this.setSpeed(Number(value)));
    fan.getCharacteristic(C.TargetFanState).onSet(async (value) => {
      if (value === C.TargetFanState.AUTO) {
        await this.send(AUTO_WRITE, 'Back to Auto');
        this.assume({ mode: 'auto' });
      } else {
        await this.send(modeWrite(modeById('manual')), 'Manual');
        this.assume({ mode: 'manual' });
      }
    });
    this.services.push(fan);
  }

  private async stopFans(state: IVentilatorState): Promise<void> {
    if (!state.manualStopAllowed) {
      this.log.warn(
        'The unit doesn\'t allow stopping the fans: turn on "Manual fan stop" on the unit first'
      );
      throw new this.hap.HapStatusError(this.hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);
    }
    await this.send(speedWrite(0), 'Fans stopped');
    this.assume({ mode: 'manual', manualLevel: 0 });
  }

  /** A fan speed from the Home app: Manual at Low, Normal or High, once the slider settles. */
  private setSpeed(percent: number): void {
    if (this.speed) clearTimeout(this.speed.timer);
    const timer = setTimeout(() => {
      this.speed = undefined;
      const state = this.state;
      if (percent <= 0) {
        if (state && !isStopped(state)) void this.stopFans(state).catch(() => undefined);
        return;
      }
      const level = levelForSpeed(percent);
      void this.send(speedWrite(percent), `Manual at ${LEVEL_WORDS[level]} (${percent}% in HomeKit)`)
        .then(() => this.assume({ mode: 'manual', manualLevel: level }))
        .catch(() => undefined);
    }, SPEED_SETTLE_MS);
    this.speed = { percent, timer };
  }

  /** A switch per mode, only one on at a time; turning the one that's on off goes back to Auto. */
  private buildModes(name: string): void {
    const { Service: S, Characteristic: C } = this.hap;
    for (const id of this.config.modeSwitches) {
      const mode = modeById(id);
      // Refresh keeps the switch this plugin always had (no subtype), so scenes using it still work.
      const service = new S.Switch(
        `${name} ${this.modeName(id)}`,
        id === 'refresh' ? undefined : `mode-${id}`
      );
      this.show(service, C.On, (state) => state.mode === id);
      service.getCharacteristic(C.On).onSet(async (value) => {
        const state = this.current();
        if (value) {
          if (state.mode === id) return;
          await this.send(modeWrite(mode), this.modeName(id));
          this.assume({ mode: id });
        } else if (state.mode === id && id !== 'auto') {
          await this.send(AUTO_WRITE, `${this.modeName(id)} off: back to Auto`);
          this.assume({ mode: 'auto' });
        } else if (id === 'auto') {
          // Auto turns off by choosing another mode; show it on again.
          setTimeout(() => this.push(), 0);
        }
      });
      this.services.push(service);
    }
  }

  /**
   * A valve per short timed mode: on starts the mode, the Home app's Duration sets how long it
   * lasts (the unit's own setting), and Remaining counts down while it runs.
   */
  private buildTimers(name: string): void {
    const { Service: S, Characteristic: C } = this.hap;
    for (const id of this.config.timers) {
      const mode = modeById(id);
      const duration = mode.duration;
      if (!duration) continue;
      const service = new S.Valve(`${name} ${this.modeName(id)} timer`, `timer-${id}`);
      const running = (state: IVentilatorState) => state.mode === id;
      service.setCharacteristic(C.ValveType, C.ValveType.GENERIC_VALVE);
      this.show(service, C.Active, (state) => (running(state) ? C.Active.ACTIVE : C.Active.INACTIVE));
      this.show(service, C.InUse, (state) =>
        running(state) ? C.InUse.IN_USE : C.InUse.NOT_IN_USE
      );
      const maxSeconds = Math.min(TIMER_MAX_SECONDS, durationSeconds(duration, duration.max));
      service
        .getCharacteristic(C.SetDuration)
        .setProps({ minValue: durationSeconds(duration, duration.min), maxValue: maxSeconds, minStep: 60 });
      service.getCharacteristic(C.RemainingDuration).setProps({ maxValue: maxSeconds });
      this.show(service, C.SetDuration, (state) => timerSeconds(duration, state.durations[id], maxSeconds));
      this.show(service, C.RemainingDuration, (state) =>
        running(state) ? clamp(state.remainingSeconds, 0, maxSeconds) : 0
      );
      service.getCharacteristic(C.Active).onSet(async (value) => {
        const state = this.current();
        if (value === C.Active.ACTIVE) {
          if (running(state)) return;
          await this.send(modeWrite(mode), `${this.modeName(id)} for ${this.durationWords(mode, state)}`);
          this.assume({ mode: id, remainingSeconds: durationSeconds(duration, state.durations[id] ?? 0) });
        } else if (running(state)) {
          await this.send(AUTO_WRITE, `${this.modeName(id)} off: back to Auto`);
          this.assume({ mode: 'auto', remainingSeconds: 0 });
        }
      });
      service.getCharacteristic(C.SetDuration).onSet(async (value) => {
        const state = this.current();
        const minutes = durationValue(duration, Number(value));
        await this.send(durationWrite(mode, minutes), `${this.modeName(id)} lasts ${minutes} ${duration.unit}`);
        this.assume({ durations: { ...state.durations, [id]: minutes } });
      });
      this.services.push(service);
    }
  }

  private durationWords(mode: IMode, state: IVentilatorState): string {
    const value = state.durations[mode.id];
    return value === undefined || !mode.duration ? 'its set time' : `${value} ${mode.duration.unit}`;
  }

  private buildThermostat(name: string): void {
    const { Service: S, Characteristic: C } = this.hap;
    const thermostat = new S.Thermostat(`${name} Thermostat`);
    this.show(thermostat, C.CurrentTemperature, (state) => state.extractTemperature);
    thermostat
      .getCharacteristic(C.TargetTemperature)
      .setProps({ minValue: SETPOINT_RANGE.min, maxValue: SETPOINT_RANGE.max, minStep: 0.5 });
    this.show(thermostat, C.TargetTemperature, (state) =>
      clamp(state.setpoint, SETPOINT_RANGE.min, SETPOINT_RANGE.max)
    );
    thermostat.getCharacteristic(C.TargetTemperature).onSet(async (value) => {
      const celsius = Number(value);
      await this.send(setpointWrite(celsius), `Temperature set to ${celsius} °C`);
      this.assume({ setpoint: celsius });
    });
    // Off stops the fans (as before); Auto runs them. The unit has no separate heat or cool.
    thermostat.getCharacteristic(C.TargetHeatingCoolingState).setProps({
      validValues: [C.TargetHeatingCoolingState.OFF, C.TargetHeatingCoolingState.AUTO],
    });
    this.show(thermostat, C.TargetHeatingCoolingState, (state) =>
      isStopped(state) ? C.TargetHeatingCoolingState.OFF : C.TargetHeatingCoolingState.AUTO
    );
    this.show(thermostat, C.CurrentHeatingCoolingState, () => C.CurrentHeatingCoolingState.OFF);
    thermostat.getCharacteristic(C.TargetHeatingCoolingState).onSet(async (value) => {
      const state = this.current();
      if (value === C.TargetHeatingCoolingState.OFF) {
        if (!isStopped(state)) await this.stopFans(state);
      } else if (isStopped(state)) {
        await this.send(AUTO_WRITE, 'Back to Auto');
        this.assume({ mode: 'auto' });
      }
    });
    this.services.push(thermostat);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A timed mode's duration as a valve's, in seconds within what HomeKit takes. */
function timerSeconds(duration: IModeDuration, value: number | undefined, maxSeconds: number) {
  const seconds = durationSeconds(duration, value ?? duration.min);
  return clamp(seconds, durationSeconds(duration, duration.min), maxSeconds);
}
