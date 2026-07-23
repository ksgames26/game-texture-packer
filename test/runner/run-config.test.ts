import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  NormalizedConfig,
  NormalizedJob,
} from "../../src/config/normalize-config.js";
import type { DiscoveredInput } from "../../src/input/discover-inputs.js";
import type { JobResult } from "../../src/packer/pack-job.js";
import { runConfig } from "../../src/runner/run-config.js";

function createJob(name: string, enabled = true): NormalizedJob {
  return {
    name,
    enabled,
    input: {
      files: ["*.png"],
      ignore: [],
      cwd: path.resolve(name),
      allowEmpty: false,
      followSymbolicLinks: false,
      caseSensitiveMatch: false,
    },
    output: {
      directory: path.resolve(name, "output"),
      overwrite: false,
      manifest: false,
    },
    packer: {},
  };
}

function createConfig(
  jobs: NormalizedJob[],
  options: Partial<Pick<NormalizedConfig, "concurrency" | "failFast">> = {},
): NormalizedConfig {
  return {
    cwd: process.cwd(),
    concurrency: 1,
    failFast: true,
    jobs,
    ...options,
  };
}

function successfulResult(job: NormalizedJob): JobResult {
  return {
    name: job.name,
    status: "succeeded",
    inputFiles: [`${job.name}.png`],
    outputFiles: [`${job.name}.json`],
    durationMs: 1,
  };
}

describe("runConfig", () => {
  it("never exceeds configured concurrency", async () => {
    const jobs = Array.from({ length: 5 }, (_, index) => createJob(`job-${index}`));
    let active = 0;
    let maximumActive = 0;
    const pack = vi.fn(async (job: NormalizedJob) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return successfulResult(job);
    });

    const summary = await runConfig(createConfig(jobs, { concurrency: 2 }), { pack });

    expect(maximumActive).toBe(2);
    expect(pack).toHaveBeenCalledTimes(5);
    expect(summary).toMatchObject({ succeeded: 5, failed: 0, skipped: 0 });
    expect(summary.jobs.map((result) => result.name)).toEqual(jobs.map((job) => job.name));
  });

  it("skips disabled jobs during a default run", async () => {
    const pack = vi.fn(async (job: NormalizedJob) => successfulResult(job));
    const summary = await runConfig(
      createConfig([createJob("enabled"), createJob("disabled", false)]),
      { pack },
    );

    expect(pack).toHaveBeenCalledOnce();
    expect(pack).toHaveBeenCalledWith(expect.objectContaining({ name: "enabled" }));
    expect(summary).toMatchObject({ succeeded: 1, failed: 0, skipped: 1 });
    expect(summary.jobs[1]).toMatchObject({ name: "disabled", status: "skipped" });
  });

  it("runs an explicitly selected disabled job", async () => {
    const pack = vi.fn(async (job: NormalizedJob) => successfulResult(job));
    const summary = await runConfig(
      createConfig([createJob("enabled"), createJob("disabled", false)]),
      { pack, selectedJobs: ["disabled"] },
    );

    expect(pack).toHaveBeenCalledOnce();
    expect(pack).toHaveBeenCalledWith(expect.objectContaining({ name: "disabled" }));
    expect(summary).toMatchObject({ succeeded: 1, failed: 0, skipped: 1 });
  });

  it("rejects unknown selected jobs", async () => {
    await expect(
      runConfig(createConfig([createJob("known")]), { selectedJobs: ["missing"] }),
    ).rejects.toThrow(/missing/);
  });

  it("stops scheduling new jobs after a fail-fast error", async () => {
    const pack = vi.fn(async (job: NormalizedJob): Promise<JobResult> => {
      if (job.name === "first") {
        throw new Error("first failed");
      }
      return successfulResult(job);
    });

    const summary = await runConfig(
      createConfig([createJob("first"), createJob("second"), createJob("third")]),
      { pack },
    );

    expect(pack).toHaveBeenCalledOnce();
    expect(summary).toMatchObject({ succeeded: 0, failed: 1, skipped: 2 });
    expect(summary.jobs.map((result) => result.status)).toEqual([
      "failed",
      "skipped",
      "skipped",
    ]);
  });

  it("collects all failures when failFast is false", async () => {
    const pack = vi.fn(async (job: NormalizedJob): Promise<JobResult> => {
      throw new Error(`${job.name} failed`);
    });
    const jobs = [createJob("one"), createJob("two"), createJob("three")];

    const summary = await runConfig(createConfig(jobs, { failFast: false }), { pack });

    expect(pack).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({ succeeded: 0, failed: 3, skipped: 0 });
    expect(summary.jobs.every((result) => result.status === "failed")).toBe(true);
  });

  it("dry-run discovers inputs without packing or writing outputs", async () => {
    const pack = vi.fn(async (job: NormalizedJob) => successfulResult(job));
    const input: DiscoveredInput = {
      absolutePath: path.resolve("image.png"),
      path: "image.png",
      contents: Buffer.from("image"),
    };
    const discover = vi.fn(async () => [input]);

    const summary = await runConfig(createConfig([createJob("dry")]), {
      dryRun: true,
      pack,
      discover,
      now: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(15),
    });

    expect(discover).toHaveBeenCalledOnce();
    expect(pack).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ succeeded: 1, failed: 0, skipped: 0 });
    expect(summary.jobs[0]).toEqual({
      name: "dry",
      status: "dry-run",
      inputFiles: ["image.png"],
      outputFiles: [],
      durationMs: 5,
    });
  });
});
