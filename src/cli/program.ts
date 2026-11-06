import path from "node:path";
import { Command, CommanderError } from "commander";
import { loadConfig } from "../config/load-config.js";
import {
  applyJobOverrides,
  normalizeConfig,
  type NormalizeConfigOptions,
} from "../config/normalize-config.js";
import { runConfig, type RunSummary } from "../runner/run-config.js";
import { registerFontCommands } from "../fonts/cli.js";
import {
  DEFAULT_CONFIG_FILENAME,
  writeInitConfig,
} from "../templates/default-config.js";

export interface CliServices {
  cwd: () => string;
  loadConfig: typeof loadConfig;
  applyJobOverrides: typeof applyJobOverrides;
  normalizeConfig: typeof normalizeConfig;
  runConfig: typeof runConfig;
  writeInitConfig: typeof writeInitConfig;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

interface PackCliOptions {
  config?: string;
  job: string[];
  set: string[];
  cwd?: string;
  concurrency?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

interface InitCliOptions {
  force?: boolean;
}

const defaultServices: CliServices = {
  cwd: () => process.cwd(),
  loadConfig,
  applyJobOverrides,
  normalizeConfig,
  runConfig,
  writeInitConfig,
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message),
};

export function createProgram(
  services: CliServices = defaultServices,
  setExitCode: (code: number) => void = () => undefined,
): Command {
  const program = new Command()
    .name("game-texture-packer")
    .description("Configuration-driven local texture atlas packer")
    .version("1.0.0")
    .enablePositionalOptions()
    .showHelpAfterError()
    .configureOutput({
      writeOut: services.stdout,
      writeErr: services.stderr,
    })
    .exitOverride();

  configurePackCommand(program).action(async (_options: PackCliOptions, command: Command) => {
    setExitCode(await executePack(command.optsWithGlobals<PackCliOptions>(), services));
  });

  configurePackCommand(
    program.command("pack").description("Pack texture atlases from a configuration file"),
  ).action(async (_options: PackCliOptions, command: Command) => {
    setExitCode(await executePack(command.optsWithGlobals<PackCliOptions>(), services));
  });

  program
    .command("init")
    .description("Create a fully documented JSONC configuration")
    .argument("[path]", "configuration path", DEFAULT_CONFIG_FILENAME)
    .option("-f, --force", "overwrite an existing configuration")
    .action(async (target: string, options: InitCliOptions) => {
      const written = await services.writeInitConfig(target, {
        cwd: path.resolve(services.cwd()),
        force: Boolean(options.force),
      });
      services.stdout(`Created texture packer config: ${written}\n`);
    });

  registerFontCommands(program, services.stdout);
  return program;
}

export async function runCli(
  argv = process.argv,
  services: CliServices = defaultServices,
): Promise<number> {
  let actionExitCode = 0;
  const program = createProgram(services, (code) => {
    actionExitCode = Math.max(actionExitCode, code);
  });
  try {
    await program.parseAsync(argv);
    return actionExitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
        return 0;
      }
      return error.exitCode || 1;
    }
    const details = error instanceof Error ? error.message : String(error);
    services.stderr(`Error: ${details}\n`);
    return 1;
  }
}

function configurePackCommand(command: Command): Command {
  return command
    .option("-c, --config <path>", "configuration file path")
    .option("-j, --job <name>", "run only this job; repeatable", collect, [])
    .option("--set <path=value>", "override input/output/packer values; repeatable", collect, [])
    .option("--cwd <path>", "override working directory")
    .option("--concurrency <count>", "override maximum concurrent jobs")
    .option("--dry-run", "validate configuration and discover inputs without writing")
    .option("-v, --verbose", "print input and output file details");
}

async function executePack(options: PackCliOptions, services: CliServices): Promise<number> {
  const commandCwd = path.resolve(services.cwd(), options.cwd === undefined ? "." : options.cwd);
  const loaded = await services.loadConfig(options.config, { cwd: commandCwd });
  const overridden = services.applyJobOverrides(loaded.config, options.set, options.job);
  const normalizeOptions: NormalizeConfigOptions = {};
  if (options.cwd) {
    normalizeOptions.cwd = commandCwd;
  }
  if (options.job.length > 0) {
    normalizeOptions.selectedJobs = options.job;
  }
  let normalized = await services.normalizeConfig(overridden, loaded.path, normalizeOptions);
  if (options.concurrency !== undefined) {
    normalized = {
      ...normalized,
      concurrency: parsePositiveInteger(options.concurrency, "concurrency"),
    };
  }

  const summary = await services.runConfig(normalized, {
    dryRun: Boolean(options.dryRun),
    selectedJobs: options.job,
  });
  printSummary(summary, services, Boolean(options.verbose));
  return summary.failed > 0 ? 1 : 0;
}

function printSummary(summary: RunSummary, services: CliServices, verbose: boolean): void {
  for (const result of summary.jobs) {
    if (result.status === "failed") {
      services.stderr(`[failed] ${result.name}: ${result.error.message}\n`);
      continue;
    }
    services.stdout(
      `[${result.status}] ${result.name}: ${result.inputFiles.length} input(s), ${result.outputFiles.length} output(s), ${result.durationMs}ms\n`,
    );
    if (verbose) {
      for (const input of result.inputFiles) {
        services.stdout(`  input: ${input}\n`);
      }
      for (const output of result.outputFiles) {
        services.stdout(`  output: ${output}\n`);
      }
    }
  }
  services.stdout(
    `Summary: ${summary.succeeded} succeeded, ${summary.failed} failed, ${summary.skipped} skipped\n`,
  );
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer; received: ${value}`);
  }
  return parsed;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
