import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { NormalizedJob } from "../../src/config/normalize-config.js";
import { discoverInputs } from "../../src/input/discover-inputs.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "game-texture-packer-input-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createJob(cwd: string, overrides: Partial<NormalizedJob["input"]> = {}): NormalizedJob {
  return {
    name: "atlas",
    enabled: true,
    input: {
      files: ["**/*.png"],
      ignore: ["**/*.tmp.png"],
      cwd,
      allowEmpty: false,
      followSymbolicLinks: false,
      caseSensitiveMatch: false,
      ...overrides,
    },
    output: {
      directory: path.join(cwd, "output"),
      overwrite: false,
      manifest: false,
    },
    packer: {},
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("discoverInputs", () => {
  it("applies glob and ignore patterns, removes duplicates, and reads buffers", async () => {
    const directory = await createTemporaryDirectory();
    await mkdir(path.join(directory, "hero"), { recursive: true });
    await writeFile(path.join(directory, "hero", "idle-1.png"), "first");
    await writeFile(path.join(directory, "hero", "idle-2.tmp.png"), "ignored");
    await writeFile(path.join(directory, "hero", "notes.txt"), "ignored");
    const job = createJob(directory, {
      files: ["**/*.png", "hero/*.png"],
    });

    const inputs = await discoverInputs(job);

    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.path).toBe("hero/idle-1.png");
    expect(inputs[0]?.contents.toString()).toBe("first");
    expect(inputs[0]?.absolutePath).toBe(path.join(directory, "hero", "idle-1.png"));
  });

  it("uses forward-slash logical paths and deterministic natural ordering", async () => {
    const directory = await createTemporaryDirectory();
    await mkdir(path.join(directory, "nested"), { recursive: true });
    await Promise.all([
      writeFile(path.join(directory, "nested", "frame-10.png"), "10"),
      writeFile(path.join(directory, "nested", "frame-2.png"), "2"),
      writeFile(path.join(directory, "nested", "Frame-1.PNG"), "1"),
    ]);

    const inputs = await discoverInputs(createJob(directory));

    expect(inputs.map((input) => input.path)).toEqual([
      "nested/Frame-1.PNG",
      "nested/frame-2.png",
      "nested/frame-10.png",
    ]);
    expect(inputs.every((input) => !input.path.includes("\\"))).toBe(true);
  });

  it("throws a task-scoped error for empty input by default", async () => {
    const directory = await createTemporaryDirectory();

    await expect(discoverInputs(createJob(directory))).rejects.toThrow(/atlas.*no input/i);
  });

  it("allows empty input when configured", async () => {
    const directory = await createTemporaryDirectory();

    await expect(
      discoverInputs(createJob(directory, { allowEmpty: true })),
    ).resolves.toEqual([]);
  });
});
