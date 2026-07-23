import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import {
  PACKER_OPTION_KEYS,
  parseConfig,
} from "../../src/config/schema.js";
import { DEFAULT_CONFIG_TEMPLATE } from "../../src/templates/default-config.js";

describe("distributed configuration metadata", () => {
  it("keeps JSON Schema packer properties in sync with runtime validation", async () => {
    const schemaPath = fileURLToPath(
      new URL("../../schema/game-texture-packer.schema.json", import.meta.url),
    );
    const schema = JSON.parse(await readFile(schemaPath, "utf8")) as {
      $defs: { packerOptions: { properties: Record<string, unknown> } };
    };

    expect(Object.keys(schema.$defs.packerOptions.properties).sort()).toEqual(
      [...PACKER_OPTION_KEYS].sort(),
    );
  });

  it("ships a valid init template that mentions every packer option", () => {
    const parsed: unknown = parse(DEFAULT_CONFIG_TEMPLATE);

    expect(() => parseConfig(parsed)).not.toThrow();
    for (const key of PACKER_OPTION_KEYS) {
      expect(DEFAULT_CONFIG_TEMPLATE).toContain(`"${key}"`);
    }
  });
});
