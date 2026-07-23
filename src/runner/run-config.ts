import type { NormalizedConfig, NormalizedJob } from "../config/normalize-config.js";
import {
  discoverInputs,
  type DiscoveredInput,
} from "../input/discover-inputs.js";
import {
  packJob,
  type JobResult,
} from "../packer/pack-job.js";

export interface FailedJobResult {
  name: string;
  status: "failed";
  inputFiles: string[];
  outputFiles: string[];
  durationMs: number;
  error: Error;
}

export type RunJobResult = JobResult | FailedJobResult;

export interface RunSummary {
  succeeded: number;
  failed: number;
  skipped: number;
  jobs: RunJobResult[];
}

export interface RunConfigOptions {
  selectedJobs?: readonly string[];
  dryRun?: boolean;
  pack?: (job: NormalizedJob) => Promise<JobResult>;
  discover?: (job: NormalizedJob) => Promise<DiscoveredInput[]>;
  now?: () => number;
}

export async function runConfig(
  config: NormalizedConfig,
  options: RunConfigOptions = {},
): Promise<RunSummary> {
  const selectedNames = validateSelectedJobs(config.jobs, options.selectedJobs);
  const results: Array<RunJobResult | undefined> = new Array(config.jobs.length);
  const runnableIndexes: number[] = [];

  for (const [index, job] of config.jobs.entries()) {
    const explicitlySelected = selectedNames?.has(job.name) ?? false;
    if ((selectedNames && !explicitlySelected) || (!selectedNames && !job.enabled)) {
      results[index] = skippedResult(job.name);
    } else {
      runnableIndexes.push(index);
    }
  }

  let nextRunnable = 0;
  let stopScheduling = false;
  const workerCount = Math.min(config.concurrency, runnableIndexes.length);

  async function worker(): Promise<void> {
    while (!stopScheduling) {
      const runnablePosition = nextRunnable;
      nextRunnable += 1;
      const jobIndex = runnableIndexes[runnablePosition];
      if (jobIndex === undefined) {
        return;
      }
      const job = config.jobs[jobIndex]!;
      try {
        results[jobIndex] = options.dryRun
          ? await runDryJob(job, options.discover ?? discoverInputs, options.now ?? Date.now)
          : await (options.pack ?? packJob)(job);
      } catch (error) {
        results[jobIndex] = {
          name: job.name,
          status: "failed",
          inputFiles: [],
          outputFiles: [],
          durationMs: 0,
          error: toError(error),
        };
        if (config.failFast) {
          stopScheduling = true;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  for (const jobIndex of runnableIndexes) {
    results[jobIndex] ??= skippedResult(config.jobs[jobIndex]!.name);
  }

  const completedResults = results.filter((result): result is RunJobResult => result !== undefined);
  return {
    succeeded: completedResults.filter(
      (result) => result.status === "succeeded" || result.status === "dry-run",
    ).length,
    failed: completedResults.filter((result) => result.status === "failed").length,
    skipped: completedResults.filter((result) => result.status === "skipped").length,
    jobs: completedResults,
  };
}

async function runDryJob(
  job: NormalizedJob,
  discover: (job: NormalizedJob) => Promise<DiscoveredInput[]>,
  now: () => number,
): Promise<JobResult> {
  const startedAt = now();
  const inputs = await discover(job);
  return {
    name: job.name,
    status: "dry-run",
    inputFiles: inputs.map((input) => input.path),
    outputFiles: [],
    durationMs: now() - startedAt,
  };
}

function validateSelectedJobs(
  jobs: readonly NormalizedJob[],
  selectedJobs?: readonly string[],
): Set<string> | undefined {
  if (!selectedJobs || selectedJobs.length === 0) {
    return undefined;
  }
  const selected = new Set(selectedJobs);
  const available = new Set(jobs.map((job) => job.name));
  const missing = [...selected].filter((name) => !available.has(name));
  if (missing.length > 0) {
    throw new Error(`Unknown texture packer job(s): ${missing.join(", ")}`);
  }
  return selected;
}

function skippedResult(name: string): JobResult {
  return {
    name,
    status: "skipped",
    inputFiles: [],
    outputFiles: [],
    durationMs: 0,
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
