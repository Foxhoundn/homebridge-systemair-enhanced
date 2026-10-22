import fs from 'node:fs';

/**
 * The names you give the tiles in the Home app (their ConfiguredName), kept in a small file in
 * Homebridge's storage so a restart doesn't put the plugin's names back. Without a file (tests),
 * they're kept only while the plugin runs.
 */
export class TileNames {
  private names: Record<string, string> = {};

  public constructor(
    /** Which accessory's names: one file can hold several ventilators'. */
    private readonly accessory: string,
    private readonly file?: string
  ) {
    if (!file) return;
    try {
      const all: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      const own = all && typeof all === 'object' ? (all as Record<string, unknown>)[accessory] : undefined;
      if (own && typeof own === 'object')
        this.names = Object.fromEntries(
          Object.entries(own).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        );
    } catch {
      // No file yet, or one this plugin can't read: start from the plugin's names.
    }
  }

  public get(tile: string): string | undefined {
    return this.names[tile];
  }

  public set(tile: string, name: string): void {
    this.names[tile] = name;
    if (!this.file) return;
    let all: Record<string, unknown> = {};
    try {
      const read: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (read && typeof read === 'object') all = read as Record<string, unknown>;
    } catch {
      // Nothing to keep from before.
    }
    all[this.accessory] = this.names;
    fs.writeFileSync(this.file, `${JSON.stringify(all, null, 2)}\n`);
  }
}
