import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_CONFIG_FILENAME = "game-texture-packer.config.jsonc";

export const DEFAULT_CONFIG_TEMPLATE = `{
  // JSON/JSONC users can point editors at the bundled schema.
  "$schema": "./schema/game-texture-packer.schema.json",
  "cwd": ".",
  "concurrency": 1,
  "failFast": true,
  "defaults": {
    "input": {
      "ignore": ["**/*.tmp.png", "**/.DS_Store"],
      "allowEmpty": false,
      "followSymbolicLinks": false,
      "caseSensitiveMatch": false
    },
    "output": {
      "overwrite": false,
      "manifest": false
    },
    "packer": {
      "textureName": "atlas",
      "suffix": "-",
      "suffixInitialValue": 0,
      "width": 2048,
      "height": 2048,
      "fixedSize": false,
      "powerOfTwo": false,
      "padding": 2,
      "extrude": 1,
      "allowRotation": false,
      "detectIdentical": true,
      "allowTrim": true,
      "trimMode": "trim",
      "alphaThreshold": 0,
      "removeFileExtension": false,
      "prependFolderName": true,
      "textureFormat": "png",
      "base64Export": false,
      "scale": 1,
      "scaleMethod": "BILINEAR",
      "tinify": false,
      "tinifyKey": "",
      // "tinifyKeyEnv": "TINYPNG_API_KEY",
      "packer": "OptimalPacker",
      "packerMethod": "Automatic",
      "exporter": "Cocos2d",
      // Custom exporter alternative:
      // "exporter": {
      //   "fileExt": "json",
      //   "template": "templates/custom-atlas.mst"
      // },
      "filter": "none",
      "appInfo": {
        "displayName": "game-texture-packer",
        "version": "1.0.0",
        "url": "https://github.com/ksgames26/game-texture-packer"
      }
    }
  },
  "jobs": [
    {
      "name": "main-atlas",
      "enabled": true,
      "input": {
        "cwd": "assets/textures",
        "files": ["**/*.png"]
      },
      "output": {
        "directory": "assets/atlases"
      },
      "packer": {
        "textureName": "main-atlas"
      }
    }
  ]
}
`;

export interface WriteInitConfigOptions {
  cwd?: string;
  force?: boolean;
}

export async function writeInitConfig(
  target = DEFAULT_CONFIG_FILENAME,
  options: WriteInitConfigOptions = {},
): Promise<string> {
  const resolvedTarget = path.resolve(options.cwd ?? process.cwd(), target);
  await mkdir(path.dirname(resolvedTarget), { recursive: true });
  try {
    await writeFile(resolvedTarget, DEFAULT_CONFIG_TEMPLATE, {
      encoding: "utf8",
      flag: options.force ? "w" : "wx",
    });
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      throw new Error(
        `Config already exists: ${resolvedTarget}. Pass --force to overwrite it.`,
        { cause: error },
      );
    }
    throw error;
  }
  return resolvedTarget;
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}
