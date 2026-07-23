import path from "node:path";
import type { NormalizedJob } from "../config/normalize-config.js";
import {
  discoverInputs,
  type DiscoveredInput,
} from "../input/discover-inputs.js";
import {
  corePacker,
  type CorePacker,
  type PackedFile,
} from "./core-adapter.js";
import {
  assertPathInsideOutput,
  writePackedFiles,
} from "./write-outputs.js";

export type JobStatus = "succeeded" | "skipped" | "dry-run";

export interface JobResult {
  name: string;
  status: JobStatus;
  inputFiles: string[];
  outputFiles: string[];
  durationMs: number;
}

export interface PackJobOptions {
  packer?: CorePacker;
  discover?: (job: NormalizedJob) => Promise<DiscoveredInput[]>;
  now?: () => number;
}

export async function packJob(
  job: NormalizedJob,
  options: PackJobOptions = {},
): Promise<JobResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  if (job.output.manifest) {
    assertPathInsideOutput(job.output.directory, job.output.manifest, "Manifest");
  }

  const inputs = await (options.discover ?? discoverInputs)(job);
  if (inputs.length === 0) {
    return {
      name: job.name,
      status: "skipped",
      inputFiles: [],
      outputFiles: [],
      durationMs: now() - startedAt,
    };
  }

  let packedFiles: PackedFile[];
  try {
    packedFiles = await (options.packer ?? corePacker)(inputs, job.packer);
  } catch (cause) {
    const details = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Job ${job.name} failed while packing: ${details}`, { cause });
  }

  const outputFiles = await writePackedFiles(
    job.output.directory,
    packedFiles,
    job.output.overwrite,
  );
  const durationMs = now() - startedAt;

  if (job.output.manifest) {
    const manifestFile: PackedFile = {
      name: path.relative(job.output.directory, job.output.manifest),
      buffer: Buffer.from(
        `${JSON.stringify(
          {
            job: job.name,
            generatedAt: new Date(startedAt).toISOString(),
            durationMs,
            inputs: inputs.map((input) => input.path),
            outputs: outputFiles.map((file) => path.relative(job.output.directory, file)),
          },
          null,
          2,
        )}\n`,
      ),
    };
    await writePackedFiles(job.output.directory, [manifestFile], job.output.overwrite);
  }

  return {
    name: job.name,
    status: "succeeded",
    inputFiles: inputs.map((input) => input.path),
    outputFiles,
    durationMs,
  };
}
