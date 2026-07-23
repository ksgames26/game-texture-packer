import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NormalizedJob } from "../../src/config/normalize-config.js";
import type { DiscoveredInput } from "../../src/input/discover-inputs.js";
import type { CorePacker } from "../../src/packer/core-adapter.js";
import { packJob } from "../../src/packer/pack-job.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "game-texture-packer-output-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createJob(directory: string, overrides: Partial<NormalizedJob["output"]> = {}): NormalizedJob {
  return {
    name: "atlas",
    enabled: true,
    input: {
      files: ["*.png"],
      ignore: [],
      cwd: directory,
      allowEmpty: false,
      followSymbolicLinks: false,
      caseSensitiveMatch: false,
    },
    output: {
      directory: path.join(directory, "output"),
      overwrite: false,
      manifest: false,
      ...overrides,
    },
    packer: { textureName: "atlas" },
  };
}

function createInput(): DiscoveredInput {
  return {
    absolutePath: path.resolve("image.png"),
    path: "image.png",
    contents: Buffer.from("image"),
  };
}

function createPacker(files = [
  { name: "atlas.json", buffer: Buffer.from("{}") },
  { name: "atlas.png", buffer: Buffer.from("png") },
]): CorePacker {
  return vi.fn(async () => files);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("packJob", () => {
  it("creates the output directory and writes returned files", async () => {
    const directory = await createTemporaryDirectory();
    const job = createJob(directory);

    const result = await packJob(job, {
      packer: createPacker(),
      discover: async () => [createInput()],
      now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125),
    });

    expect(await readFile(path.join(job.output.directory, "atlas.json"), "utf8")).toBe("{}");
    expect(await readFile(path.join(job.output.directory, "atlas.png"), "utf8")).toBe("png");
    expect(result).toEqual({
      name: "atlas",
      status: "succeeded",
      inputFiles: ["image.png"],
      outputFiles: [
        path.join(job.output.directory, "atlas.json"),
        path.join(job.output.directory, "atlas.png"),
      ],
      durationMs: 25,
    });
  });

  it("refuses to overwrite an existing file by default", async () => {
    const directory = await createTemporaryDirectory();
    const job = createJob(directory);
    await mkdir(job.output.directory, { recursive: true });
    await writeFile(path.join(job.output.directory, "atlas.json"), "existing");

    await expect(
      packJob(job, {
        packer: createPacker(),
        discover: async () => [createInput()],
      }),
    ).rejects.toThrow(/atlas\.json.*overwrite/i);
    expect(await readFile(path.join(job.output.directory, "atlas.json"), "utf8")).toBe("existing");
  });

  it("overwrites existing files only when explicitly enabled", async () => {
    const directory = await createTemporaryDirectory();
    const job = createJob(directory, { overwrite: true });
    await mkdir(job.output.directory, { recursive: true });
    await writeFile(path.join(job.output.directory, "atlas.json"), "existing");

    await packJob(job, {
      packer: createPacker([{ name: "atlas.json", buffer: Buffer.from("new") }]),
      discover: async () => [createInput()],
    });

    expect(await readFile(path.join(job.output.directory, "atlas.json"), "utf8")).toBe("new");
  });

  it.each(["../escape.png", path.resolve("absolute.png")])(
    "rejects unsafe output name %s",
    async (name) => {
      const directory = await createTemporaryDirectory();
      const job = createJob(directory);

      await expect(
        packJob(job, {
          packer: createPacker([{ name, buffer: Buffer.from("unsafe") }]),
          discover: async () => [createInput()],
        }),
      ).rejects.toThrow(/unsafe|outside|absolute/i);

      await expect(access(path.resolve(job.output.directory, name))).rejects.toThrow();
    },
  );

  it("writes an optional manifest inside the output directory", async () => {
    const directory = await createTemporaryDirectory();
    const manifest = path.join(directory, "output", "manifest.json");
    const job = createJob(directory, { manifest });

    await packJob(job, {
      packer: createPacker([{ name: "atlas.json", buffer: Buffer.from("{}") }]),
      discover: async () => [createInput()],
      now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125),
    });

    const data = JSON.parse(await readFile(manifest, "utf8")) as Record<string, unknown>;
    expect(data).toMatchObject({
      job: "atlas",
      inputs: ["image.png"],
      outputs: ["atlas.json"],
    });
  });

  it("rejects a manifest outside the output directory", async () => {
    const directory = await createTemporaryDirectory();
    const job = createJob(directory, { manifest: path.join(directory, "outside.json") });

    await expect(
      packJob(job, {
        packer: createPacker(),
        discover: async () => [createInput()],
      }),
    ).rejects.toThrow(/manifest.*outside/i);
  });

  it("wraps upstream errors with job context and preserves the cause", async () => {
    const directory = await createTemporaryDirectory();
    const cause = new Error("upstream failed");
    const packer: CorePacker = async () => {
      throw cause;
    };

    let received: unknown;
    try {
      await packJob(createJob(directory), {
        packer,
        discover: async () => [createInput()],
      });
    } catch (error) {
      received = error;
    }

    expect(received).toBeInstanceOf(Error);
    expect((received as Error).message).toMatch(/atlas.*upstream failed/i);
    expect((received as Error).cause).toBe(cause);
  });

  it("skips the core packer when allowEmpty produces no inputs", async () => {
    const directory = await createTemporaryDirectory();
    const job = createJob(directory);
    job.input.allowEmpty = true;
    const packer = createPacker();

    const result = await packJob(job, {
      packer,
      discover: async () => [],
    });

    expect(packer).not.toHaveBeenCalled();
    expect(result.status).toBe("skipped");
  });
});
