# Changelog

## 2.1.0

### Changed

- **Refresh and Fireplace are their timers.** A timer turns its mode on and off, sets how long it lasts and counts down, so the separate Refresh and Fireplace switches are gone by default, and the timers are named after their modes ("Ventilation Refresh"). Scenes and automations that used the Refresh switch need the Refresh timer instead. To keep the switches, tick them under **Modes to show as switches** in the settings.

### New

- The README explains using **Fireplace** while cooking under a hood that vents outside, and naming it "Cooking".

## 2.0.1

### Fixed

- **Every tile read "Ventilation" in the Home app.** Since iOS 16 the Home app shows a tile's own name only from its ConfiguredName, which the plugin now sets on each one: "Ventilation Refresh", "Ventilation Fan" and so on. A name you give a tile in the Home app is kept across restarts.

## 2.0.0

A rewrite: faster, a switch for every mode, timers, and the fan's real level.

### New

- **A switch per mode** for scenes and automations: Auto, Visitors (the unit's Crowded), Refresh, Fireplace, Away and Holiday. Only one is on at a time; turning the one that's on off goes back to what it interrupted (Auto, or the manual level you had), as the unit itself does when a mode's time is up.
- **Refresh and Fireplace timers**: set how long the mode lasts from the Home app, and watch it count down.
- **The fan shows the level it really runs at**, Auto included: Low 16%, Normal 50%, High 83%, Maximum 100%. The top of the slider starts Refresh, the only way to Maximum. The fan's Auto setting switches back to Auto.
- **Outdoor temperature** and **filter life** tiles.
- **Settings in Homebridge's web interface**: which modes and timers to show, your own names for the modes, how often the unit is read.

### Changed

- **The unit is read in one request every 10 seconds** and HomeKit is told about each change. 1.x asked the unit separately for every value the Home app wanted, waiting up to 20 seconds each, so tiles could show "No Response".
- **The Refresh switch stays on while Refresh runs**, and turning it off ends Refresh. In 1.x it turned itself off after a second.
- **The thermostat's range is the unit's**, 12–30 °C in half degrees.
- The Timer tile (time left shown as a battery level) is gone: the timers count down instead.
- Written in TypeScript, with tests; needs Homebridge 1.8 or 2.x and Node 20 or newer.

### Fixed

- **Refresh no longer changes your settings.** 1.x sent the unit's whole Home form to start it, which also set the temperature to 18 °C, the manual level to Low and ECO mode off.
- **During Refresh the fan showed 16%** (the manual Low setting) while the unit ran at Maximum.

## 1.0.6 and earlier

See [npm](https://www.npmjs.com/package/@lv426/homebridge-systemair-enhanced?activeTab=versions).
