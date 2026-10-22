<p align="center">
  <img src="icon.png" width="120" alt="Systemair Ventilator for Homebridge" />
</p>

<h1 align="center">Systemair Ventilator for Homebridge</h1>

<p align="center">
  Your Systemair SAVE ventilation in Apple Home: modes for scenes, timers, the fan's real level,<br />
  temperature, humidity, the outdoor temperature and the filter.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lv426/homebridge-systemair-enhanced"><img src="https://img.shields.io/npm/v/@lv426/homebridge-systemair-enhanced?label=npm" alt="npm version" /></a>
  <a href="https://github.com/Foxhoundn/homebridge-systemair-enhanced/actions/workflows/ci.yml"><img src="https://github.com/Foxhoundn/homebridge-systemair-enhanced/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/homebridge-1.8%20%7C%202.x-blueviolet" alt="Homebridge 1.8 and 2.x" />
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@lv426/homebridge-systemair-enhanced" alt="MIT licence" /></a>
</p>

---

It talks to the unit's **SAVE Connect** module the same way the module's own web page does, so there's no cloud, no account and no Modbus wiring: if you can open the unit's web page in a browser, this plugin can run it.

## What you get in the Home app

| Tile | What it does |
| --- | --- |
| **Fan** | Shows the level the fans really run at, Auto included. Drag it to run them manually at Low, Normal or High; drag it to the top to start Refresh; switch it back to Auto, or off. |
| **Auto, Visitors, Refresh, Fireplace, Away, Holiday** | A switch per mode, for scenes and automations. Only one is on at a time. Turning the one that's on off goes back to what it interrupted: Auto, or the manual level you had. |
| **Refresh timer, Fireplace timer** | Set how long the mode lasts (the tile's Duration), turn it on, and watch it count down. |
| **Thermostat** | The temperature in the house and the setpoint (12–30 °C). |
| **Eco Mode** | The unit's ECO mode. |
| **Humidity** | Relative humidity of the extract air. |
| **Outdoor** | The unit's outdoor temperature sensor. |
| **Filter** | How much filter life is left; the Home app tells you when it's time to change it. |

The unit is read in one request every 10 seconds, and HomeKit is told about each change, so the Home app opens straight away and automations see changes within seconds.

### The fan slider

The slider shows and sets the unit's airflow levels:

| Slider | The unit runs | Shown as |
| --- | --- | --- |
| 0% | Off (Manual) | 0% |
| 1–33% | Manual, **Low** | 16% |
| 34–66% | Manual, **Normal** | 50% |
| 67–91% | Manual, **High** | 83% |
| 92–100% | **Refresh**, at Maximum for its set time, then back to what it was doing | 100% |

Manual mode can't go above High: Maximum is reached only by modes like Refresh. Turning the fans off needs **Manual fan stop** allowed on the unit.

### The modes

| Mode | What the unit does | How long |
| --- | --- | --- |
| **Auto** | Follows its week schedule and demand control. | — |
| **Visitors** (the unit's *Crowded*) | More air for a full house. | 1–8 hours |
| **Refresh** | As much air as it can, to air the house out. | 1–240 minutes |
| **Fireplace** | Slight overpressure, so the fireplace draws well. | 1–60 minutes |
| **Away** | Less air while you're out. | 1–72 hours |
| **Holiday** | Less air for longer, while you're away for days. | 1–365 days |

How long each mode lasts is the unit's own setting: the timer tiles change it for Refresh and Fireplace, and the unit's web page for the rest. When a mode's time is up, the unit goes back to the mode it interrupted. Changing a timer's minutes while its mode runs saves them for next time; the running mode keeps its countdown.

*Cooker hood* and *Vacuum cleaner* modes are started by switches wired to the unit, so HomeKit can't start them.

## Install

Search for **Systemair Ventilator** under **Plugins** in Homebridge's web interface and install it, or:

```bash
npm install -g @lv426/homebridge-systemair-enhanced
```

You need a Systemair SAVE unit with a **SAVE Connect** module on your network, and its address (the one you open its web page at). Give it a fixed address in your router so it doesn't move.

## Settings

Fill them in under the plugin's **Settings** in Homebridge's web interface, or add this to `config.json`:

```json
{
  "accessories": [
    {
      "accessory": "SystemairVentilatorEnhanced",
      "name": "Ventilation",
      "ip": "192.168.1.50"
    }
  ]
}
```

| Setting | What it does | Default |
| --- | --- | --- |
| `name` | Each tile is named after it: "Ventilation Fan", "Ventilation Refresh". | `Ventilation` |
| `ip` | The SAVE Connect module's address. | — |
| `modeSwitches` | The modes shown as switches: `auto`, `crowded`, `refresh`, `fireplace`, `away`, `holiday`. | all six |
| `timers` | The modes with a timer tile: `refresh`, `fireplace`. | both |
| `modeNames` | Your own names, for example `{ "refresh": "Air out" }`. | Crowded is `Visitors`; the rest as on the unit |
| `eco` | Show the ECO mode switch. | `true` |
| `outdoorTemperature` | Show the outdoor temperature. | `true` |
| `filter` | Show the filter. | `true` |
| `pollSeconds` | How often the unit is read (at least 5). | `10` |

## Upgrading from 1.x

The accessory and the tiles 1.x had (the fan, the Refresh and Eco Mode switches, the thermostat and humidity) stay the same to HomeKit, so scenes and automations that use them keep working. The new tiles appear next to them. See the [changelog](CHANGELOG.md) for what changed.

## How it talks to the unit

Like the unit's own web page: `GET /mread?{"1160":1}` reads registers and `GET /mwrite?{"1161":4}` writes them, one request at a time. The registers and modes are listed in [`src/registers.ts`](src/registers.ts) and [`src/modes.ts`](src/modes.ts), each as the web page names it.

## Development

```bash
npm install
npm run check   # typecheck and tests
npm run build
```

The tests cover the register mapping (from a real unit's replies), the client and the accessory on Homebridge's own HomeKit library.

**Releasing:** bump the version and push to `master`; GitHub Actions publishes it to npm, tags it, creates the GitHub release from the [changelog](CHANGELOG.md) and posts to Discord.

```bash
npm version patch   # or minor, major, or prerelease --preid beta
git push --follow-tags
```

A prerelease (`2.1.0-beta.1`) is published under npm's `beta` tag.

## Licence

[MIT](LICENSE)
