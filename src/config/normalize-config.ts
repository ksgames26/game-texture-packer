import path from "node:path";
import { parseConfig } from "./schema.js";
import type {
  CustomExporter,
  InputOptions,
  OutputOptions,
  PackerOptions,
  TexturePackerConfig,
} from "./types.js";

export type CorePackerOptions = Omit<PackerOptions, "tinifyKeyEnv">;

export interface NormalizedInputOptions {
  files: string[];
  ignore: string[];
  cwd: string;
  allowEmpty: boolean;
  followSymbolicLinks: boolean;
  caseSensitiveMatch: boolean;
}

export interface NormalizedOutputOptions {
  directory: string;
  overwrite: boolean;
  manifest: false | string;
}

export interface NormalizedJob {
  name: string;
  enabled: boolean;
  input: NormalizedInputOptions;
  output: NormalizedOutputOptions;
  packer: CorePackerOptions;
}

export interface NormalizedConfig {
  cwd: string;
  concurrency: number;
  failFast: boolean;
  jobs: NormalizedJob[];
}

export interface NormalizeConfigOptions {
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  selectedJobs?: readonly string[];
}

export async function normalizeConfig(
  config: TexturePackerConfig,
  configPath: string,
  options: NormalizeConfigOptions = {},
): Promise<NormalizedConfig> {
  const parsed = parseConfig(config);
  const configDirectory = path.dirname(path.resolve(configPath));
  const effectiveCwd = path.resolve(configDirectory, options.cwd ?? parsed.cwd ?? ".");
  const selectedNames = validateSelectedJobs(parsed, options.selectedJobs);
  const jobs = parsed.jobs
    .filter((job) => selectedNames === undefined || selectedNames.has(job.name))
    .map((job) => normalizeJob(job, effectiveCwd, options.env ?? process.env));

  return {
    cwd: effectiveCwd,
    concurrency: parsed.concurrency ?? 1,
    failFast: parsed.failFast ?? true,
    jobs,
  };
}

export function applyJobOverrides(
  config: TexturePackerConfig,
  overrides: readonly string[],
  selectedJobs?: readonly string[],
): TexturePackerConfig {
  const cloned = structuredClone(config);
  const selectedNames = validateSelectedJobs(cloned, selectedJobs);
  const targets = cloned.jobs.filter(
    (job) => selectedNames === undefined || selectedNames.has(job.name),
  );

  for (const expression of overrides) {
    const separator = expression.indexOf("=");
    if (separator <= 0) {
      throw new Error(`Invalid override ${expression}; expected path=value`);
    }
    const keyPath = expression.slice(0, separator);
    const segments = keyPath.split(".");
    if (segments.length < 2 || !["input", "output", "packer"].includes(segments[0]!)) {
      throw new Error(`Unsupported override path: ${keyPath}`);
    }
    const unsafeKey = segments.find((segment) =>
      ["__proto__", "prototype", "constructor"].includes(segment),
    );
    if (unsafeKey) {
      throw new Error(`Unsafe override key: ${unsafeKey}`);
    }

    const value = parseOverrideValue(expression.slice(separator + 1));
    for (const job of targets) {
      setNestedValue(job as unknown as Record<string, unknown>, segments, value);
    }
  }

  return parseConfig(cloned);
}

function normalizeJob(
  job: TexturePackerConfig["jobs"][number],
  effectiveCwd: string,
  env: Readonly<Record<string, string | undefined>>,
): NormalizedJob {
  const inputCwd = path.resolve(effectiveCwd, job.input.cwd ?? ".");
  const outputDirectory = path.resolve(effectiveCwd, job.output.directory);
  return {
    name: job.name,
    enabled: job.enabled ?? true,
    input: {
      files: toStringArray(job.input.files),
      ignore: toStringArray(job.input.ignore),
      cwd: inputCwd,
      allowEmpty: job.input.allowEmpty ?? false,
      followSymbolicLinks: job.input.followSymbolicLinks ?? false,
      caseSensitiveMatch: job.input.caseSensitiveMatch ?? false,
    },
    output: {
      directory: outputDirectory,
      overwrite: job.output.overwrite ?? false,
      manifest: normalizeManifest(job.output, outputDirectory),
    },
    packer: normalizePackerOptions(job.packer ?? {}, effectiveCwd, env),
  };
}

function normalizePackerOptions(
  options: PackerOptions,
  effectiveCwd: string,
  env: Readonly<Record<string, string | undefined>>,
): CorePackerOptions {
  const { tinifyKeyEnv, ...coreOptions } = options;
  if (tinifyKeyEnv) {
    const key = env[tinifyKeyEnv];
    if (key === undefined) {
      throw new Error(`Missing environment variable for tinifyKeyEnv: ${tinifyKeyEnv}`);
    }
    coreOptions.tinifyKey = key;
  }

  if (isCustomExporter(coreOptions.exporter) && coreOptions.exporter.template) {
    coreOptions.exporter = {
      ...coreOptions.exporter,
      template: path.resolve(effectiveCwd, coreOptions.exporter.template),
    };
  }
  return coreOptions;
}

function normalizeManifest(output: OutputOptions, outputDirectory: string): false | string {
  if (output.manifest === true) {
    return path.join(outputDirectory, "game-texture-packer.manifest.json");
  }
  if (typeof output.manifest === "string") {
    return path.resolve(outputDirectory, output.manifest);
  }
  return false;
}

function validateSelectedJobs(
  config: TexturePackerConfig,
  selectedJobs?: readonly string[],
): Set<string> | undefined {
  if (!selectedJobs || selectedJobs.length === 0) {
    return undefined;
  }
  const available = new Set(config.jobs.map((job) => job.name));
  const selected = new Set(selectedJobs);
  const missing = [...selected].filter((name) => !available.has(name));
  if (missing.length > 0) {
    throw new Error(`Unknown texture packer job(s): ${missing.join(", ")}`);
  }
  return selected;
}

function parseOverrideValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function setNestedValue(
  target: Record<string, unknown>,
  segments: readonly string[],
  value: unknown,
): void {
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
      const created: Record<string, unknown> = {};
      current[segment] = created;
      current = created;
    } else {
      current = existing as Record<string, unknown>;
    }
  }
  current[segments.at(-1)!] = value;
}

function toStringArray(value: InputOptions["files"] | InputOptions["ignore"]): string[] {
  if (value === undefined) {
    return [];
  }
  return typeof value === "string" ? [value] : [...value];
}

function isCustomExporter(value: PackerOptions["exporter"]): value is CustomExporter {
  return typeof value === "object" && value !== null;
}
