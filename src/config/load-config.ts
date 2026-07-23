import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse, type ParseError, printParseErrorCode } from "jsonc-parser";
import { parseConfig } from "./schema.js";
import type { TexturePackerConfig } from "./types.js";

export const CONFIG_FILENAMES = [
  "game-texture-packer.config.json",
  "game-texture-packer.config.jsonc",
  "game-texture-packer.config.js",
  "game-texture-packer.config.cjs",
  "game-texture-packer.config.mjs",
] as const;

export interface LoadConfigOptions {
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
}

export interface LoadedConfig {
  path: string;
  config: TexturePackerConfig;
}

export async function findConfig(startDirectory = process.cwd()): Promise<string | undefined> {
  const directory = path.resolve(startDirectory);
  for (const filename of CONFIG_FILENAMES) {
    const candidate = path.join(directory, filename);
    try {
      await access(candidate);
      return candidate;
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }
  }
  return undefined;
}

export async function loadConfig(
  configPath?: string,
  options: LoadConfigOptions = {},
): Promise<LoadedConfig> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const resolvedPath = configPath
    ? path.resolve(cwd, configPath)
    : await findConfig(cwd);

  if (!resolvedPath) {
    throw new Error(
      `No texture packer config found in ${cwd}. Expected one of: ${CONFIG_FILENAMES.join(", ")}`,
    );
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  let rawConfig: unknown;
  if (extension === ".json" || extension === ".jsonc") {
    rawConfig = await loadJsonConfig(resolvedPath);
  } else if ([".js", ".cjs", ".mjs"].includes(extension)) {
    rawConfig = await loadModuleConfig(resolvedPath);
  } else {
    throw new Error(`Unsupported config extension: ${extension || "(none)"}`);
  }

  const expanded = expandEnvironmentVariables(rawConfig, options.env ?? process.env);
  return {
    path: resolvedPath,
    config: parseConfig(expanded),
  };
}

async function loadJsonConfig(configPath: string): Promise<unknown> {
  const source = await readFile(configPath, "utf8");
  const errors: ParseError[] = [];
  const result: unknown = parse(source, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0) {
    const details = errors
      .map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`)
      .join(", ");
    throw new Error(`Invalid JSON/JSONC config ${configPath}: ${details}`);
  }
  return result;
}

async function loadModuleConfig(configPath: string): Promise<unknown> {
  const url = pathToFileURL(configPath);
  url.searchParams.set("loaded", `${Date.now()}-${Math.random()}`);
  const namespace = (await import(url.href)) as Record<string, unknown>;
  return namespace.default ?? namespace;
}

function expandEnvironmentVariables(
  value: unknown,
  env: Readonly<Record<string, string | undefined>>,
): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
      const replacement = env[name];
      if (replacement === undefined) {
        throw new Error(`Missing environment variable: ${name}`);
      }
      return replacement;
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => expandEnvironmentVariables(item, env));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, expandEnvironmentVariables(item, env)]),
    );
  }
  return value;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
