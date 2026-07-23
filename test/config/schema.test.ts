import { describe, expect, it } from "vitest";
import {
  BITMAP_FILTERS,
  EXPORTERS,
  MAX_RECTS_BIN_METHODS,
  MAX_RECTS_PACKER_METHODS,
  OPTIMAL_PACKER_METHODS,
  PACKERS,
  SCALE_METHODS,
  TEXTURE_FORMATS,
  TRIM_MODES,
  parseConfig,
} from "../../src/config/schema.js";
import type { TexturePackerConfig } from "../../src/config/types.js";

function minimalConfig(): TexturePackerConfig {
  return {
    jobs: [
      {
        name: "atlas",
        input: { files: ["images/**/*.png"] },
        output: { directory: "dist/atlas" },
      },
    ],
  };
}

describe("parseConfig", () => {
  it("applies safe defaults", () => {
    const result = parseConfig(minimalConfig());

    expect(result.concurrency).toBe(1);
    expect(result.failFast).toBe(true);
    expect(result.jobs[0]?.enabled).toBe(true);
    expect(result.jobs[0]?.input.allowEmpty).toBe(false);
    expect(result.jobs[0]?.input.followSymbolicLinks).toBe(false);
    expect(result.jobs[0]?.input.caseSensitiveMatch).toBe(false);
    expect(result.jobs[0]?.output.overwrite).toBe(false);
    expect(result.jobs[0]?.output.manifest).toBe(false);
  });

  it.each(TEXTURE_FORMATS)("accepts texture format %s", (textureFormat) => {
    const config = minimalConfig();
    config.jobs[0]!.packer = { textureFormat };
    expect(parseConfig(config).jobs[0]?.packer?.textureFormat).toBe(textureFormat);
  });

  it.each(TRIM_MODES)("accepts trim mode %s", (trimMode) => {
    const config = minimalConfig();
    config.jobs[0]!.packer = { trimMode };
    expect(parseConfig(config).jobs[0]?.packer?.trimMode).toBe(trimMode);
  });

  it.each(SCALE_METHODS)("accepts scale method %s", (scaleMethod) => {
    const config = minimalConfig();
    config.jobs[0]!.packer = { scaleMethod };
    expect(parseConfig(config).jobs[0]?.packer?.scaleMethod).toBe(scaleMethod);
  });

  it.each(PACKERS)("accepts packer %s", (packer) => {
    const config = minimalConfig();
    config.jobs[0]!.packer = { packer };
    expect(parseConfig(config).jobs[0]?.packer?.packer).toBe(packer);
  });

  it.each([...MAX_RECTS_BIN_METHODS, ...MAX_RECTS_PACKER_METHODS, ...OPTIMAL_PACKER_METHODS])(
    "accepts packer method %s",
    (packerMethod) => {
      const config = minimalConfig();
      config.jobs[0]!.packer = { packerMethod };
      expect(parseConfig(config).jobs[0]?.packer?.packerMethod).toBe(packerMethod);
    },
  );

  it.each(EXPORTERS)("accepts exporter %s", (exporter) => {
    const config = minimalConfig();
    config.jobs[0]!.packer = { exporter };
    expect(parseConfig(config).jobs[0]?.packer?.exporter).toBe(exporter);
  });

  it.each(BITMAP_FILTERS)("accepts filter %s", (filter) => {
    const config = minimalConfig();
    config.jobs[0]!.packer = { filter };
    expect(parseConfig(config).jobs[0]?.packer?.filter).toBe(filter);
  });

  it("rejects duplicate job names", () => {
    const config = minimalConfig();
    config.jobs.push({ ...config.jobs[0]! });
    expect(() => parseConfig(config)).toThrow(/unique|duplicate/i);
  });

  it.each([0, -1])("rejects non-positive width %s", (width) => {
    const config = minimalConfig();
    config.jobs[0]!.packer = { width };
    expect(() => parseConfig(config)).toThrow();
  });

  it.each([-1, 256])("rejects alpha threshold %s", (alphaThreshold) => {
    const config = minimalConfig();
    config.jobs[0]!.packer = { alphaThreshold };
    expect(() => parseConfig(config)).toThrow();
  });

  it("rejects a custom exporter without template or content", () => {
    const config = minimalConfig();
    config.jobs[0]!.packer = { exporter: { fileExt: "json" } };
    expect(() => parseConfig(config)).toThrow(/template|content/i);
  });

  it("rejects a custom exporter with both template and content", () => {
    const config = minimalConfig();
    config.jobs[0]!.packer = {
      exporter: { fileExt: "json", template: "atlas.mst", content: "{}" },
    };
    expect(() => parseConfig(config)).toThrow(/template|content/i);
  });
});
