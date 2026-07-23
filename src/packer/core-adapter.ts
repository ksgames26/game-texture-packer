import { packAsync } from "free-tex-packer-core";
import type { CorePackerOptions } from "../config/normalize-config.js";
import type { DiscoveredInput } from "../input/discover-inputs.js";

export interface PackedFile {
  name: string;
  buffer: Buffer;
}

export type CorePacker = (
  files: readonly DiscoveredInput[],
  options: CorePackerOptions,
) => Promise<PackedFile[]>;

type UpstreamPackAsync = (
  files: Array<{ path: string; contents: Buffer }>,
  options: Record<string, unknown>,
) => Promise<PackedFile[]>;

const upstreamPackAsync = packAsync as unknown as UpstreamPackAsync;

export const corePacker: CorePacker = async (files, options) => {
  return upstreamPackAsync(
    files.map((file) => ({
      path: file.path,
      contents: file.contents,
    })),
    options as Record<string, unknown>,
  );
};
