import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { TexturePackerConfig } from "../../src/config/types.js";
import type { NormalizedConfig } from "../../src/config/normalize-config.js";
import type { RunSummary } from "../../src/runner/run-config.js";
import {
  runCli,
  type CliServices,
} from "../../src/cli/program.js";

const rawConfig: TexturePackerConfig = {
  jobs: [
    {
      name: "atlas",
      input: { files: ["images/*.png"] },
      output: { directory: "output" },
    },
  ],
};

const normalizedConfig: NormalizedConfig = {
  cwd: path.resolve("project"),
  concurrency: 1,
  failFast: true,
  jobs: [],
};

const successfulSummary: RunSummary = {
  succeeded: 1,
  failed: 0,
  skipped: 0,
  jobs: [
    {
      name: "atlas",
      status: "succeeded",
      inputFiles: ["image.png"],
      outputFiles: [path.resolve("output/atlas.png")],
      durationMs: 12,
    },
  ],
};

function createServices(summary: RunSummary = successfulSummary) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const services: CliServices = {
    cwd: () => path.resolve("workspace"),
    loadConfig: vi.fn(async () => ({
      path: path.resolve("workspace/custom.config.json"),
      config: rawConfig,
    })),
    applyJobOverrides: vi.fn(() => rawConfig),
    normalizeConfig: vi.fn(async () => normalizedConfig),
    runConfig: vi.fn(async () => summary),
    writeInitConfig: vi.fn(async (target) => path.resolve(target)),
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  };
  return { services, stdout, stderr };
}

describe("runCli", () => {
  it("runs pack by default with config, jobs, overrides, cwd, concurrency, and dry-run", async () => {
    const { services } = createServices();

    const exitCode = await runCli(
      [
        "node",
        "game-texture-packer",
        "--config",
        "custom.config.json",
        "--job",
        "hero",
        "--job",
        "effects",
        "--set",
        "packer.width=4096",
        "--set",
        "output.overwrite=true",
        "--cwd",
        "release",
        "--concurrency",
        "3",
        "--dry-run",
      ],
      services,
    );

    expect(exitCode).toBe(0);
    expect(services.loadConfig).toHaveBeenCalledWith("custom.config.json", {
      cwd: path.resolve("workspace/release"),
    });
    expect(services.applyJobOverrides).toHaveBeenCalledWith(
      rawConfig,
      ["packer.width=4096", "output.overwrite=true"],
      ["hero", "effects"],
    );
    expect(services.normalizeConfig).toHaveBeenCalledWith(
      rawConfig,
      path.resolve("workspace/custom.config.json"),
      {
        cwd: path.resolve("workspace/release"),
        selectedJobs: ["hero", "effects"],
      },
    );
    expect(services.runConfig).toHaveBeenCalledWith(
      { ...normalizedConfig, concurrency: 3 },
      { dryRun: true, selectedJobs: ["hero", "effects"] },
    );
  });

  it("supports the explicit pack subcommand", async () => {
    const { services } = createServices();

    await expect(
      runCli(["node", "game-texture-packer", "pack", "--config", "atlas.json"], services),
    ).resolves.toBe(0);

    expect(services.loadConfig).toHaveBeenCalledWith("atlas.json", {
      cwd: path.resolve("workspace"),
    });
  });

  it("runs init with a target path and force flag", async () => {
    const { services, stdout } = createServices();

    const exitCode = await runCli(
      ["node", "game-texture-packer", "init", "configs/atlas.jsonc", "--force"],
      services,
    );

    expect(exitCode).toBe(0);
    expect(services.writeInitConfig).toHaveBeenCalledWith("configs/atlas.jsonc", {
      cwd: path.resolve("workspace"),
      force: true,
    });
    expect(stdout.join("\n")).toMatch(/configs.*atlas\.jsonc/i);
  });

  it("returns one and prints a useful error when init refuses overwrite", async () => {
    const { services, stderr } = createServices();
    vi.mocked(services.writeInitConfig).mockRejectedValueOnce(
      new Error("Config already exists; pass --force to overwrite"),
    );

    const exitCode = await runCli(
      ["node", "game-texture-packer", "init", "existing.jsonc"],
      services,
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("\n")).toMatch(/already exists.*force/i);
  });

  it("returns one and prints failed job details", async () => {
    const failure = new Error("packing exploded");
    const { services, stderr } = createServices({
      succeeded: 0,
      failed: 1,
      skipped: 0,
      jobs: [
        {
          name: "atlas",
          status: "failed",
          inputFiles: [],
          outputFiles: [],
          durationMs: 0,
          error: failure,
        },
      ],
    });

    const exitCode = await runCli(["node", "game-texture-packer"], services);

    expect(exitCode).toBe(1);
    expect(stderr.join("\n")).toMatch(/atlas.*packing exploded/i);
  });

  it("rejects invalid concurrency", async () => {
    const { services, stderr } = createServices();

    const exitCode = await runCli(
      ["node", "game-texture-packer", "--concurrency", "0"],
      services,
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("\n")).toMatch(/concurrency.*positive/i);
  });
});
