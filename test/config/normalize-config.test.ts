import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config/schema.js";
import {
  applyJobOverrides,
  normalizeConfig,
} from "../../src/config/normalize-config.js";
import type { TexturePackerConfig } from "../../src/config/types.js";

const configPath = path.resolve("fixtures/config/game-texture-packer.config.json");
const configDirectory = path.dirname(configPath);

function createConfig(): TexturePackerConfig {
  return {
    cwd: "../project",
    concurrency: 2,
    failFast: false,
    defaults: {
      input: {
        ignore: ["**/*.tmp.png"],
        followSymbolicLinks: true,
      },
      output: {
        overwrite: true,
        manifest: "atlas-manifest.json",
      },
      packer: {
        width: 2048,
        padding: 2,
        exporter: "Cocos2d",
      },
    },
    jobs: [
      {
        name: "hero",
        input: {
          files: ["images/hero/**/*.png"],
          cwd: "source",
          followSymbolicLinks: false,
        },
        output: { directory: "output/hero" },
        packer: { textureName: "hero", padding: 4 },
      },
      {
        name: "effects",
        enabled: false,
        input: { files: ["images/effects/**/*.png"] },
        output: { directory: "output/effects" },
      },
    ],
  };
}

describe("normalizeConfig", () => {
  it("merges defaults and resolves paths from the effective cwd", async () => {
    const normalized = await normalizeConfig(parseConfig(createConfig()), configPath);
    const hero = normalized.jobs[0]!;
    const effectiveCwd = path.resolve(configDirectory, "../project");

    expect(normalized.cwd).toBe(effectiveCwd);
    expect(normalized.concurrency).toBe(2);
    expect(normalized.failFast).toBe(false);
    expect(hero.input.cwd).toBe(path.resolve(effectiveCwd, "source"));
    expect(hero.input.ignore).toEqual(["**/*.tmp.png"]);
    expect(hero.input.followSymbolicLinks).toBe(false);
    expect(hero.output.directory).toBe(path.resolve(effectiveCwd, "output/hero"));
    expect(hero.output.overwrite).toBe(true);
    expect(hero.output.manifest).toBe(path.resolve(effectiveCwd, "output/hero/atlas-manifest.json"));
    expect(hero.packer).toMatchObject({
      width: 2048,
      padding: 4,
      exporter: "Cocos2d",
      textureName: "hero",
    });
  });

  it("resolves a custom exporter template from the effective cwd", async () => {
    const config = createConfig();
    config.jobs[0]!.packer = {
      exporter: { fileExt: "plist", template: "templates/cocos.mst" },
    };

    const normalized = await normalizeConfig(parseConfig(config), configPath);

    expect(normalized.jobs[0]?.packer.exporter).toEqual({
      fileExt: "plist",
      template: path.resolve(configDirectory, "../project/templates/cocos.mst"),
    });
  });

  it("reads the TinyPNG key from tinifyKeyEnv", async () => {
    const config = createConfig();
    config.jobs[0]!.packer = {
      tinify: true,
      tinifyKey: "committed-secret",
      tinifyKeyEnv: "TINY_PNG_KEY",
    };

    const normalized = await normalizeConfig(parseConfig(config), configPath, {
      env: { TINY_PNG_KEY: "environment-secret" },
    });

    expect(normalized.jobs[0]?.packer.tinifyKey).toBe("environment-secret");
    expect(normalized.jobs[0]?.packer).not.toHaveProperty("tinifyKeyEnv");
  });

  it("fails when tinifyKeyEnv is missing", async () => {
    const config = createConfig();
    config.jobs[0]!.packer = { tinify: true, tinifyKeyEnv: "TINY_PNG_KEY" };

    await expect(
      normalizeConfig(parseConfig(config), configPath, { env: {} }),
    ).rejects.toThrow(/TINY_PNG_KEY/);
  });

  it("selects named jobs even when they are disabled", async () => {
    const normalized = await normalizeConfig(parseConfig(createConfig()), configPath, {
      selectedJobs: ["effects"],
    });

    expect(normalized.jobs.map((job) => job.name)).toEqual(["effects"]);
    expect(normalized.jobs[0]?.enabled).toBe(false);
  });

  it("rejects unknown selected jobs", async () => {
    await expect(
      normalizeConfig(parseConfig(createConfig()), configPath, {
        selectedJobs: ["missing"],
      }),
    ).rejects.toThrow(/missing/);
  });
});

describe("applyJobOverrides", () => {
  it("parses JSON literals and applies overrides to selected jobs", () => {
    const overridden = applyJobOverrides(createConfig(), [
      "packer.width=4096",
      "output.overwrite=false",
      "packer.textureName=release-atlas",
    ], ["hero"]);

    expect(overridden.jobs[0]?.packer).toMatchObject({
      width: 4096,
      textureName: "release-atlas",
    });
    expect(overridden.jobs[0]?.output.overwrite).toBe(false);
    expect(overridden.jobs[1]?.packer?.width).toBe(2048);
  });

  it("rejects unsupported override roots", () => {
    expect(() => applyJobOverrides(createConfig(), ["name=renamed"])).toThrow(/name/);
  });

  it("rejects prototype pollution keys", () => {
    expect(() =>
      applyJobOverrides(createConfig(), ["packer.__proto__.polluted=true"]),
    ).toThrow(/__proto__/);
  });

  it("rejects unknown selected jobs", () => {
    expect(() =>
      applyJobOverrides(createConfig(), ["packer.width=4096"], ["missing"]),
    ).toThrow(/missing/);
  });
});
