import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { NormalizedJob } from "../../src/config/normalize-config.js";
import { packJob } from "../../src/packer/pack-job.js";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("free-tex-packer-core integration", () => {
  it("packs a real PNG into texture and JsonHash outputs", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "game-texture-packer-integration-"));
    temporaryDirectories.push(directory);
    await writeFile(path.join(directory, "one-pixel.png"), ONE_PIXEL_PNG);
    const job: NormalizedJob = {
      name: "integration",
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
      },
      packer: {
        textureName: "atlas",
        width: 16,
        height: 16,
        exporter: "JsonHash",
        allowRotation: false,
        allowTrim: false,
        detectIdentical: false,
        prependFolderName: false,
      },
    };

    const result = await packJob(job);

    const texture = await readFile(path.join(job.output.directory, "atlas.png"));
    const atlas = JSON.parse(
      await readFile(path.join(job.output.directory, "atlas.json"), "utf8"),
    ) as { frames: Record<string, unknown> };
    expect(texture.byteLength).toBeGreaterThan(0);
    expect(atlas.frames).toHaveProperty("one-pixel.png");
    expect(result.outputFiles.map((file) => path.basename(file)).sort()).toEqual([
      "atlas.json",
      "atlas.png",
    ]);
  });
});
