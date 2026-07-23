# Game Texture Packer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, configuration-driven local CLI and library around `free-tex-packer-core@0.3.8`.

**Architecture:** Keep configuration loading, normalization, input discovery, packing, orchestration, and CLI parsing in separate modules with typed interfaces. Validate all external data before file access, resolve every relative path from the effective configuration directory, and inject the packer/filesystem boundaries in unit tests while retaining one real upstream integration test.

**Tech Stack:** Node.js 20+, TypeScript 5, ESM, pnpm, Commander, fast-glob, jsonc-parser, Zod, Vitest, free-tex-packer-core 0.3.8.

## Global Constraints

- Repository path is `pkgs/game-texture-packer` and package/bin name is `game-texture-packer`.
- The package is private and uses pnpm.
- Configuration formats are `.json`, `.jsonc`, `.js`, `.cjs`, and `.mjs`.
- Every public upstream option documented by free-tex-packer-core 0.3.8 is configurable.
- Relative paths resolve from the effective configuration `cwd`.
- No recursive output-directory deletion is implemented.
- Existing user files are not overwritten unless `output.overwrite` is true.
- The package does not create or edit Cocos Creator `.meta` files.
- Production behavior is developed test-first.

---

### Task 1: Package skeleton and validated configuration model

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/config/types.ts`
- Create: `src/config/schema.ts`
- Create: `test/config/schema.test.ts`

**Interfaces:**
- Produces: `TexturePackerConfig`, `TexturePackerJob`, `PackerOptions`, `defineConfig(config)`.
- Produces: `parseConfig(value: unknown): TexturePackerConfig`.
- Produces: exported enum arrays and `PACKER_OPTION_KEYS` for schema/docs consistency checks.

- [ ] **Step 1: Add the package/test skeleton and failing schema tests**

Create package scripts whose exact verification commands are:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsx src/cli.ts",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

The first tests must assert that `parseConfig` supplies `concurrency: 1`, `failFast: true`, `enabled: true`, `allowEmpty: false`, and `overwrite: false`; accepts every documented enum; rejects duplicate job names, non-positive atlas dimensions, invalid alpha thresholds, and a custom exporter with neither `template` nor `content`.

- [ ] **Step 2: Run the schema test and verify RED**

Run: `pnpm test -- test/config/schema.test.ts`

Expected: FAIL because `src/config/schema.ts` does not exist.

- [ ] **Step 3: Implement the public types and Zod schema**

Use these central interfaces:

```ts
export interface TexturePackerConfig {
  cwd?: string;
  concurrency?: number;
  failFast?: boolean;
  defaults?: JobDefaults;
  jobs: TexturePackerJob[];
}

export interface TexturePackerJob {
  name: string;
  enabled?: boolean;
  input: InputOptions;
  output: OutputOptions;
  packer?: PackerOptions;
}

export function defineConfig(config: TexturePackerConfig): TexturePackerConfig {
  return config;
}
```

The schema must enumerate `png|jpg|webp`, `trim|crop`, all five scaling methods, all three packers, all MaxRects methods, all README exporters, `grayscale|mask|none`, and validate the custom exporter XOR rule.

- [ ] **Step 4: Run schema tests and static checks**

Run: `pnpm test -- test/config/schema.test.ts`

Expected: all schema tests PASS.

Run: `pnpm run lint`

Expected: TypeScript exits 0.

- [ ] **Step 5: Commit the configuration model**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json vitest.config.ts .gitignore src/config/types.ts src/config/schema.ts test/config/schema.test.ts
git commit -m "feat: add validated texture packer config"
```

### Task 2: Configuration discovery, loading, and normalization

**Files:**
- Create: `src/config/load-config.ts`
- Create: `src/config/normalize-config.ts`
- Create: `test/config/load-config.test.ts`
- Create: `test/config/normalize-config.test.ts`

**Interfaces:**
- Consumes: `parseConfig`, `TexturePackerConfig`, `PackerOptions` from Task 1.
- Produces: `findConfig(startDir, fs?)`, `loadConfig(path?, options?)`.
- Produces: `normalizeConfig(config, configPath, options?): Promise<NormalizedConfig>`.
- Produces: `applyJobOverrides(config, overrides): TexturePackerConfig` for CLI `--set`.

- [ ] **Step 1: Write failing loader tests**

Cover exact discovery precedence, comments and trailing commas in JSONC, default exports from ESM/CJS, recursive `${NAME}` expansion, a missing environment variable error containing its name, and module exports wrapped as `{ default: config }`.

- [ ] **Step 2: Verify loader RED**

Run: `pnpm test -- test/config/load-config.test.ts`

Expected: FAIL because `load-config.ts` does not exist.

- [ ] **Step 3: Implement discovery and loading**

Use this discovery list verbatim:

```ts
export const CONFIG_FILENAMES = [
  "game-texture-packer.config.json",
  "game-texture-packer.config.jsonc",
  "game-texture-packer.config.js",
  "game-texture-packer.config.cjs",
  "game-texture-packer.config.mjs",
] as const;
```

Read JSON/JSONC as UTF-8; dynamic-import JS-family files via `pathToFileURL` with a cache-busting query. Expand environment variables across string values without changing object keys, then call `parseConfig`.

- [ ] **Step 4: Write and verify failing normalization tests**

Assert that defaults merge one level into input/output/packer, config `cwd` resolves relative to the config directory, job paths become absolute, `tinifyKeyEnv` replaces `tinifyKey`, exporter templates become absolute, unknown selected jobs fail, and `--set packer.width=4096` applies to selected jobs after JSON-literal parsing.

Run: `pnpm test -- test/config/normalize-config.test.ts`

Expected: FAIL because `normalize-config.ts` does not exist.

- [ ] **Step 5: Implement normalization and overrides**

Return this stable normalized shape:

```ts
export interface NormalizedJob {
  name: string;
  input: Required<InputOptions> & { cwd: string };
  output: Required<Pick<OutputOptions, "directory" | "overwrite">> & OutputOptions;
  packer: PackerOptions;
}

export interface NormalizedConfig {
  cwd: string;
  concurrency: number;
  failFast: boolean;
  jobs: NormalizedJob[];
}
```

Only allow CLI override roots `input`, `output`, and `packer`; reject prototype-polluting keys `__proto__`, `prototype`, and `constructor`; validate the result again through `parseConfig`.

- [ ] **Step 6: Run configuration tests and commit**

Run: `pnpm test -- test/config`

Expected: all config tests PASS.

```bash
git add src/config/load-config.ts src/config/normalize-config.ts test/config/load-config.test.ts test/config/normalize-config.test.ts
git commit -m "feat: load and normalize packer configs"
```

### Task 3: Deterministic input discovery

**Files:**
- Create: `src/input/discover-inputs.ts`
- Create: `test/input/discover-inputs.test.ts`

**Interfaces:**
- Consumes: `NormalizedJob` from Task 2.
- Produces: `discoverInputs(job): Promise<DiscoveredInput[]>`.
- Produces: `DiscoveredInput = { absolutePath: string; path: string; contents: Buffer }`.

- [ ] **Step 1: Write failing discovery tests**

Create temporary nested PNG/text fixtures. Assert glob inclusion, ignore exclusion, duplicate-pattern de-duplication, forward-slash logical paths, case-insensitive deterministic ordering, and `allowEmpty` behavior.

- [ ] **Step 2: Verify discovery RED**

Run: `pnpm test -- test/input/discover-inputs.test.ts`

Expected: FAIL because the discovery module does not exist.

- [ ] **Step 3: Implement discovery**

Call `fast-glob` with `absolute: true`, `onlyFiles: true`, `unique: true`, and the configured symlink/case options. Compute the upstream `path` relative to `input.cwd`, replace Windows separators with `/`, sort with `localeCompare(..., "en", { numeric: true, sensitivity: "base" })`, then read each file.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test -- test/input/discover-inputs.test.ts`

Expected: all discovery tests PASS.

```bash
git add src/input/discover-inputs.ts test/input/discover-inputs.test.ts
git commit -m "feat: discover texture inputs deterministically"
```

### Task 4: Safe pack execution and real upstream integration

**Files:**
- Create: `src/packer/core-adapter.ts`
- Create: `src/packer/pack-job.ts`
- Create: `src/packer/write-outputs.ts`
- Create: `test/packer/pack-job.test.ts`
- Create: `test/packer/integration.test.ts`
- Create: `test/fixtures/one-pixel.png`

**Interfaces:**
- Consumes: `NormalizedJob`, `DiscoveredInput`.
- Produces: `CorePacker = (files, options) => Promise<PackedFile[]>`.
- Produces: `packJob(job, options?): Promise<JobResult>`.
- Produces: `JobResult = { name, status, inputFiles, outputFiles, durationMs }`.

- [ ] **Step 1: Write failing safe-output tests**

Inject a fake `CorePacker` returning controlled buffers. Assert output directory creation, `overwrite: false`, overwrite success when true, rejection of absolute names and `../escape.png`, optional manifest content, and wrapping upstream errors with the job name and original cause.

- [ ] **Step 2: Verify pack-job RED**

Run: `pnpm test -- test/packer/pack-job.test.ts`

Expected: FAIL because `pack-job.ts` does not exist.

- [ ] **Step 3: Implement adapter, safe writer, and packJob**

The adapter is the only module importing `packAsync`. Strip wrapper-only `tinifyKeyEnv` before passing options. Resolve every returned file under the output directory and verify it remains inside that directory before writing. Use exclusive creation when overwrite is false.

- [ ] **Step 4: Verify unit tests**

Run: `pnpm test -- test/packer/pack-job.test.ts`

Expected: all unit tests PASS.

- [ ] **Step 5: Add a real integration test**

Pack `test/fixtures/one-pixel.png` with `exporter: "JsonHash"`, `textureName: "atlas"`, `allowRotation: false`, and `allowTrim: false`. Assert `atlas.png` and `atlas.json` exist, are non-empty, and the JSON frame table contains `one-pixel.png`.

- [ ] **Step 6: Verify integration and commit**

Run: `pnpm test -- test/packer`

Expected: unit and real upstream integration tests PASS.

```bash
git add src/packer test/packer test/fixtures/one-pixel.png
git commit -m "feat: pack and write atlas outputs safely"
```

### Task 5: Multi-job runner and dry-run

**Files:**
- Create: `src/runner/run-config.ts`
- Create: `test/runner/run-config.test.ts`

**Interfaces:**
- Consumes: `NormalizedConfig`, `packJob`.
- Produces: `runConfig(config, options?): Promise<RunSummary>`.
- Produces: `RunSummary = { succeeded, failed, skipped, jobs }`.

- [ ] **Step 1: Write failing runner tests**

Assert concurrency never exceeds the configured value, disabled jobs are skipped unless explicitly selected, fail-fast stops new scheduling, non-fail-fast reports all errors, and dry-run discovers input but never calls the packer or writes outputs.

- [ ] **Step 2: Verify runner RED**

Run: `pnpm test -- test/runner/run-config.test.ts`

Expected: FAIL because `run-config.ts` does not exist.

- [ ] **Step 3: Implement bounded scheduling**

Use an index-based worker pool with at most `concurrency` workers. Record results in original configuration order. For fail-fast, stop workers from taking another job after the first failure while allowing already-running jobs to settle.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test -- test/runner/run-config.test.ts`

Expected: all runner tests PASS.

```bash
git add src/runner/run-config.ts test/runner/run-config.test.ts
git commit -m "feat: run multiple atlas jobs"
```

### Task 6: CLI, init template, schema, documentation, and release verification

**Files:**
- Create: `src/cli.ts`
- Create: `src/index.ts`
- Create: `src/cli/program.ts`
- Create: `src/templates/default-config.ts`
- Create: `schema/game-texture-packer.schema.json`
- Create: `examples/game-texture-packer.config.jsonc`
- Create: `test/cli/program.test.ts`
- Create: `test/schema/schema-sync.test.ts`
- Create: `README.md`
- Create: `LICENSE`
- Create: `NOTICE`

**Interfaces:**
- Consumes: loaders, normalizer, runner, and public types from Tasks 1–5.
- Produces: executable `game-texture-packer init [path]` and `game-texture-packer pack` commands.
- Produces: package exports `defineConfig`, `loadConfig`, `normalizeConfig`, `discoverInputs`, `packJob`, and `runConfig`.

- [ ] **Step 1: Write failing CLI tests**

Construct the Commander program with injected stdout/stderr and action services. Assert default `pack`, explicit `--config`, repeated `--job`, `--dry-run`, repeated `--set`, `--cwd`, `init` refusing overwrite, and non-zero failure handling.

- [ ] **Step 2: Verify CLI RED**

Run: `pnpm test -- test/cli/program.test.ts`

Expected: FAIL because CLI modules do not exist.

- [ ] **Step 3: Implement CLI and exports**

The executable entry only calls `createProgram().parseAsync()` and sets `process.exitCode = 1` on failure. Human logs include job name, input count, written files, elapsed milliseconds, and a final succeeded/failed/skipped summary.

- [ ] **Step 4: Add full init template and JSON Schema sync test**

The generated JSONC must show every packer field with a valid default/example and comments. The schema sync test compares `Object.keys(schema.$defs.packerOptions.properties)` with `PACKER_OPTION_KEYS`, preventing undocumented omissions.

- [ ] **Step 5: Write executable documentation**

README sections: installation, quick start, commands, discovery, full configuration reference with defaults, all packers/methods/exporters, custom exporter, environment variables/TinyPNG, multi-job example, JavaScript config, programmatic API, output safety, Cocos Creator note, troubleshooting, development commands, and upstream attribution.

- [ ] **Step 6: Run full verification**

Run: `pnpm test`

Expected: all tests PASS with zero failures.

Run: `pnpm run lint`

Expected: TypeScript static checking exits 0.

Run: `pnpm run build`

Expected: ESM JavaScript and declarations are generated in `dist/`.

Run: `node dist/cli.js --help`

Expected: help lists `init`, `pack`, config/job/dry-run/set/cwd options.

- [ ] **Step 7: Commit and publish the initial repository state**

```bash
git add src test schema examples README.md LICENSE NOTICE package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json vitest.config.ts docs/superpowers/plans/2026-07-23-game-texture-packer.md
git commit -m "feat: add configurable local texture packer"
git push -u origin main
```

- [ ] **Step 8: Register the submodule in game-push**

From the parent repository:

```bash
git submodule add -b main https://github.com/ksgames26/game-texture-packer.git pkgs/game-texture-packer
git status --short
```

Expected: `.gitmodules` is modified and `pkgs/game-texture-packer` appears as a gitlink without staging unrelated user changes.
