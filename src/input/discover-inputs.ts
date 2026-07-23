import { readFile } from "node:fs/promises";
import path from "node:path";
import fastGlob from "fast-glob";
import type { NormalizedJob } from "../config/normalize-config.js";

export interface DiscoveredInput {
  absolutePath: string;
  path: string;
  contents: Buffer;
}

export async function discoverInputs(job: NormalizedJob): Promise<DiscoveredInput[]> {
  const absolutePaths = await fastGlob(job.input.files, {
    cwd: job.input.cwd,
    ignore: job.input.ignore,
    absolute: true,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: job.input.followSymbolicLinks,
    caseSensitiveMatch: job.input.caseSensitiveMatch,
  });

  const discovered = absolutePaths
    .map((absolutePath) => ({
      absolutePath: path.resolve(absolutePath),
      path: toLogicalPath(path.relative(job.input.cwd, absolutePath)),
    }))
    .sort((left, right) =>
      left.path.localeCompare(right.path, "en", {
        numeric: true,
        sensitivity: "base",
      }),
    );

  if (discovered.length === 0 && !job.input.allowEmpty) {
    throw new Error(`Job ${job.name} has no input files matching: ${job.input.files.join(", ")}`);
  }

  return Promise.all(
    discovered.map(async (input) => ({
      ...input,
      contents: await readFile(input.absolutePath),
    })),
  );
}

function toLogicalPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
