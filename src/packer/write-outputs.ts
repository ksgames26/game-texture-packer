import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PackedFile } from "./core-adapter.js";

export async function writePackedFiles(
  outputDirectory: string,
  files: readonly PackedFile[],
  overwrite: boolean,
): Promise<string[]> {
  const targets = files.map((file) => ({
    file,
    target: resolveSafeOutputPath(outputDirectory, file.name),
  }));
  const uniqueTargets = new Set(targets.map(({ target }) => normalizeForComparison(target)));
  if (uniqueTargets.size !== targets.length) {
    throw new Error("Upstream packer returned duplicate output file names");
  }

  if (!overwrite) {
    await Promise.all(targets.map(({ target }) => assertTargetDoesNotExist(target)));
  }

  await mkdir(outputDirectory, { recursive: true });
  for (const { file, target } of targets) {
    if (!Buffer.isBuffer(file.buffer)) {
      throw new Error(`Upstream output ${file.name} does not contain a Buffer`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.buffer, overwrite ? undefined : { flag: "wx" });
  }
  return targets.map(({ target }) => target);
}

export function resolveSafeOutputPath(outputDirectory: string, name: string): string {
  if (!name || path.isAbsolute(name)) {
    throw new Error(`Unsafe absolute or empty output file name: ${name}`);
  }
  const resolvedDirectory = path.resolve(outputDirectory);
  const target = path.resolve(resolvedDirectory, name);
  const relative = path.relative(resolvedDirectory, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe output file outside output directory: ${name}`);
  }
  return target;
}

export function assertPathInsideOutput(outputDirectory: string, target: string, label: string): void {
  const resolvedDirectory = path.resolve(outputDirectory);
  const relative = path.relative(resolvedDirectory, path.resolve(target));
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the output directory: ${target}`);
  }
}

async function assertTargetDoesNotExist(target: string): Promise<void> {
  try {
    await access(target);
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }
    throw error;
  }
  throw new Error(`Output file ${target} already exists; enable overwrite to replace it`);
}

function normalizeForComparison(filePath: string): string {
  return process.platform === "win32" ? filePath.toLowerCase() : filePath;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
