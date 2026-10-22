import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface ISchemaProperty {
  type?: string;
  properties?: Record<string, ISchemaProperty>;
}

type TLayoutItem = string | { key?: string; items?: TLayoutItem[] };

const file = JSON.parse(readFileSync(path.join(__dirname, '../config.schema.json'), 'utf8')) as {
  schema: { properties: Record<string, ISchemaProperty> };
  layout: TLayoutItem[];
};

/** Every field a person fills in, by its full key: an object's fields are `parent.child`. */
function fields(properties: Record<string, ISchemaProperty>, prefix = ''): string[] {
  return Object.entries(properties).flatMap(([name, property]) =>
    property.type === 'object' && property.properties
      ? fields(property.properties, `${prefix}${name}.`)
      : [`${prefix}${name}`],
  );
}

function layoutKeys(items: TLayoutItem[]): string[] {
  return items.flatMap((item) =>
    typeof item === 'string' ? [item] : [...(item.key ? [item.key] : []), ...layoutKeys(item.items ?? [])],
  );
}

describe('the settings form in Homebridge', () => {
  // Homebridge draws only the fields its layout lists. An object listed whole shows its title with
  // nothing to fill in under it (2.1.1's "Your own names for the modes").
  it('lists every field by its full key', () => {
    const listed = layoutKeys(file.layout);
    expect(fields(file.schema.properties).filter((field) => !listed.includes(field))).toEqual([]);
  });

  it('lists nothing the settings don’t have', () => {
    const known = new Set(fields(file.schema.properties));
    expect(layoutKeys(file.layout).filter((key) => !known.has(key))).toEqual([]);
  });
});
