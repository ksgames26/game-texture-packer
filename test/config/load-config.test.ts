import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONFIG_FILENAMES,
  findConfig,
  loadConfig,
} from "../../src/config/load-config.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "game-texture-packer-config-"));
  temporaryDirectories.push(directory);
  return directory;
}

function configSource(outputDirectory = "output"): string {
  return JSON.stringify({
    jobs: [
      {
        name: "atlas",
        input: { files: ["images/*.png"] },
        output: { directory: outputDirectory },
      },
    ],
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("findConfig", () => {
  it("uses the documented discovery precedence", async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, CONFIG_FILENAMES[1]), configSource("jsonc"));
    await writeFile(path.join(directory, CONFIG_FILENAMES[0]), configSource("json"));

    await expect(findConfig(directory)).resolves.toBe(path.join(directory, CONFIG_FILENAMES[0]));
  });

  it("returns undefined when no supported config exists", async () => {
    const directory = await createTemporaryDirectory();
    await expect(findConfig(directory)).resolves.toBeUndefined();
  });
});

describe("loadConfig", () => {
  it("loads JSONC with comments, trailing commas, and $schema", async () => {
    const directory = await createTemporaryDirectory();
    const configPath = path.join(directory, "game-texture-packer.config.jsonc");
    await writeFile(
      configPath,
      `{
        // Editor completion
        "$schema": "./schema.json",
        "jobs": [{
          "name": "atlas",
          "input": { "files": ["images/*.png",], },
          "output": { "directory": "output", },
        }],
      }`,
    );

    const loaded = await loadConfig(configPath);

    expect(loaded.path).toBe(configPath);
    expect(loaded.config.jobs[0]?.name).toBe("atlas");
  });

  it("loads a CommonJS default export", async () => {
    const directory = await createTemporaryDirectory();
    const configPath = path.join(directory, "game-texture-packer.config.cjs");
    await writeFile(configPath, `module.exports = ${configSource("cjs-output")};`);

    const loaded = await loadConfig(configPath);

    expect(loaded.config.jobs[0]?.output.directory).toBe("cjs-output");
  });

  it("loads an ES module default export", async () => {
    const directory = await createTemporaryDirectory();
    const configPath = path.join(directory, "game-texture-packer.config.mjs");
    await writeFile(configPath, `export default ${configSource("esm-output")};`);

    const loaded = await loadConfig(configPath);

    expect(loaded.config.jobs[0]?.output.directory).toBe("esm-output");
  });

  it("recursively expands environment variables before validation", async () => {
    const directory = await createTemporaryDirectory();
    const configPath = path.join(directory, "game-texture-packer.config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        cwd: "${PROJECT_ROOT}",
        jobs: [
          {
            name: "atlas",
            input: { files: ["${IMAGE_DIR}/**/*.png"] },
            output: { directory: "${OUTPUT_DIR}" },
          },
        ],
      }),
    );

    const loaded = await loadConfig(configPath, {
      env: {
        PROJECT_ROOT: "project",
        IMAGE_DIR: "images",
        OUTPUT_DIR: "atlas-output",
      },
    });

    expect(loaded.config.cwd).toBe("project");
    expect(loaded.config.jobs[0]?.input.files).toEqual(["images/**/*.png"]);
    expect(loaded.config.jobs[0]?.output.directory).toBe("atlas-output");
  });

  it("reports a missing environment variable by name", async () => {
    const directory = await createTemporaryDirectory();
    const configPath = path.join(directory, "game-texture-packer.config.json");
    await writeFile(configPath, configSource("${MISSING_OUTPUT}"));

    await expect(loadConfig(configPath, { env: {} })).rejects.toThrow(/MISSING_OUTPUT/);
  });

  it("discovers a config from the requested working directory", async () => {
    const directory = await createTemporaryDirectory();
    const configPath = path.join(directory, CONFIG_FILENAMES[0]);
    await writeFile(configPath, configSource());

    const loaded = await loadConfig(undefined, { cwd: directory });

    expect(loaded.path).toBe(configPath);
  });
});
