# Homebridge Systemair Ventilator

Your Systemair SAVE ventilation in HomeKit, through its SAVE Connect module (the one whose web page you open at the unit's address).

- **The fan** at the speed it really runs at. Set a speed to run it manually at Low, Normal or High, switch it back to Auto, or turn it off (where the unit allows it).
- **A switch per mode** for scenes and automations: Auto, Crowded, Refresh, Fireplace, Away and Holiday. Only one is on at a time; turning the one that's on off goes back to Auto.
- **Timers for Refresh and Fireplace.** The Home app's Duration sets how long the mode lasts, and the tile counts down while it runs.
- **Temperature** (what the house is at, and the setpoint), **humidity**, the **outdoor temperature** and the **filter** (how long until it's due).

The unit is read in one request every 10 seconds, and HomeKit is told about each change, so the Home app opens without waiting.

## Install

In Homebridge's web interface, search for **Systemair Ventilator** under Plugins and install it, or:

```bash
npm install -g @lv426/homebridge-systemair-enhanced
```

## Settings

Fill them in under the plugin's **Settings** in Homebridge's web interface, or add this to `config.json`:

```json
{
  "accessories": [
    {
      "accessory": "SystemairVentilatorEnhanced",
      "name": "Ventilation",
      "ip": "192.168.68.57"
    }
  ]
}
```

| Setting | What it does | Default |
| --- | --- | --- |
| `name` | Each tile is named after it ("Ventilation Fan"). | `Ventilation` |
| `ip` | The SAVE Connect module's address. | — |
| `modeSwitches` | Modes shown as switches: `auto`, `crowded`, `refresh`, `fireplace`, `away`, `holiday`. | all six |
| `timers` | Modes with a timer tile: `refresh`, `fireplace`. | both |
| `modeNames` | Your own names, for example `{ "crowded": "Visitors" }`. | the unit's |
| `outdoorTemperature` | Show the outdoor temperature. | `true` |
| `filter` | Show the filter. | `true` |
| `pollSeconds` | How often the unit is read (at least 5). | `10` |

Cooker hood and Vacuum cleaner modes are started by switches wired to the unit, so HomeKit can't start them.

## Upgrading from 1.x

The tiles you had (fan, Refresh switch, thermostat, humidity and timer) stay as they were, so scenes and automations that use them keep working. New tiles appear next to them.

Two things changed:

- **Refresh only switches Refresh on.** 1.x also set the temperature to 18 °C, the manual speed to Low and ECO off, because it sent the unit's whole Home form.
- **The fan shows the speed it really runs at.** In Refresh it used to show 16% (the manual Low setting) while the unit ran at maximum.

## How it talks to the unit

The same way the unit's own web page does: `GET /mread?{"1160":1}` reads registers and `GET /mwrite?{"1161":4}` writes them. The registers are listed in [`src/registers.ts`](src/registers.ts) and [`src/modes.ts`](src/modes.ts).

## Development

```bash
npm install
npm run check   # typecheck and tests
npm run build
```
