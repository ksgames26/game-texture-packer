import { z } from "zod";
import type { TexturePackerConfig } from "./types.js";

export const TEXTURE_FORMATS = ["png", "jpg", "webp"] as const;
export const TRIM_MODES = ["trim", "crop"] as const;
export const SCALE_METHODS = [
  "BILINEAR",
  "NEAREST_NEIGHBOR",
  "BICUBIC",
  "HERMITE",
  "BEZIER",
] as const;
export const PACKERS = ["MaxRectsBin", "MaxRectsPacker", "OptimalPacker"] as const;
export const MAX_RECTS_BIN_METHODS = [
  "BestShortSideFit",
  "BestLongSideFit",
  "BestAreaFit",
  "BottomLeftRule",
  "ContactPointRule",
] as const;
export const MAX_RECTS_PACKER_METHODS = [
  "Smart",
  "Square",
  "SmartSquare",
  "SmartArea",
  "SquareArea",
  "SmartSquareArea",
] as const;
export const EXPORTERS = [
  "JsonHash",
  "JsonArray",
  "Css",
  "OldCss",
  "Pixi",
  "GodotAtlas",
  "GodotTileset",
  "PhaserHash",
  "PhaserArray",
  "Phaser3",
  "XML",
  "Starling",
  "Cocos2d",
  "Spine",
  "Unreal",
  "UIKit",
  "Unity3D",
  "Egret2D",
] as const;
export const BITMAP_FILTERS = ["grayscale", "mask", "none"] as const;

export const PACKER_OPTION_KEYS = [
  "textureName",
  "suffix",
  "suffixInitialValue",
  "width",
  "height",
  "fixedSize",
  "powerOfTwo",
  "padding",
  "extrude",
  "allowRotation",
  "detectIdentical",
  "allowTrim",
  "trimMode",
  "alphaThreshold",
  "removeFileExtension",
  "prependFolderName",
  "textureFormat",
  "base64Export",
  "scale",
  "scaleMethod",
  "tinify",
  "tinifyKey",
  "tinifyKeyEnv",
  "packer",
  "packerMethod",
  "exporter",
  "filter",
  "appInfo",
] as const;

const oneOrManyStrings = z
  .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
  .transform((value) => (typeof value === "string" ? [value] : value));

const optionalOneOrManyStrings = z
  .union([z.string().min(1), z.array(z.string().min(1))])
  .transform((value) => (typeof value === "string" ? [value] : value));

const inputShape = {
  files: oneOrManyStrings,
  ignore: optionalOneOrManyStrings.default([]),
  cwd: z.string().min(1).optional(),
  allowEmpty: z.boolean().default(false),
  followSymbolicLinks: z.boolean().default(false),
  caseSensitiveMatch: z.boolean().default(false),
};

const outputShape = {
  directory: z.string().min(1),
  overwrite: z.boolean().default(false),
  manifest: z.union([z.boolean(), z.string().min(1)]).default(false),
};

const customExporterSchema = z
  .object({
    fileExt: z.string().min(1).regex(/^\.?[a-zA-Z0-9_-]+$/, "Invalid exporter file extension"),
    template: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.template) === Boolean(value.content)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom exporter requires exactly one of template or content",
      });
    }
  });

export const packerOptionsSchema = z
  .object({
    textureName: z.string().min(1).optional(),
    suffix: z.string().optional(),
    suffixInitialValue: z.number().int().nonnegative().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    fixedSize: z.boolean().optional(),
    powerOfTwo: z.boolean().optional(),
    padding: z.number().int().nonnegative().optional(),
    extrude: z.number().int().nonnegative().optional(),
    allowRotation: z.boolean().optional(),
    detectIdentical: z.boolean().optional(),
    allowTrim: z.boolean().optional(),
    trimMode: z.enum(TRIM_MODES).optional(),
    alphaThreshold: z.number().int().min(0).max(255).optional(),
    removeFileExtension: z.boolean().optional(),
    prependFolderName: z.boolean().optional(),
    textureFormat: z.enum(TEXTURE_FORMATS).optional(),
    base64Export: z.boolean().optional(),
    scale: z.number().positive().optional(),
    scaleMethod: z.enum(SCALE_METHODS).optional(),
    tinify: z.boolean().optional(),
    tinifyKey: z.string().optional(),
    tinifyKeyEnv: z.string().min(1).optional(),
    packer: z.enum(PACKERS).optional(),
    packerMethod: z
      .enum([...MAX_RECTS_BIN_METHODS, ...MAX_RECTS_PACKER_METHODS] as [string, ...string[]])
      .optional(),
    exporter: z.union([z.enum(EXPORTERS), customExporterSchema]).optional(),
    filter: z.enum(BITMAP_FILTERS).optional(),
    appInfo: z
      .object({
        url: z.string().url(),
        version: z.string().min(1),
        displayName: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const inputSchema = z.object(inputShape).strict();
const outputSchema = z.object(outputShape).strict();

const defaultsSchema = z
  .object({
    input: z.object(inputShape).partial().strict().optional(),
    output: z.object(outputShape).partial().strict().optional(),
    packer: packerOptionsSchema.optional(),
  })
  .strict();

const jobSchema = z
  .object({
    name: z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Invalid job name"),
    enabled: z.boolean().default(true),
    input: inputSchema,
    output: outputSchema,
    packer: packerOptionsSchema.default({}),
  })
  .strict();

export const configSchema = z
  .object({
    $schema: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
    concurrency: z.number().int().positive().default(1),
    failFast: z.boolean().default(true),
    defaults: defaultsSchema.default({}),
    jobs: z.array(jobSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const names = new Set<string>();
    for (const [index, job] of value.jobs.entries()) {
      if (names.has(job.name)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["jobs", index, "name"],
          message: `Job names must be unique; duplicate: ${job.name}`,
        });
      }
      names.add(job.name);
    }
  });

export function parseConfig(value: unknown): TexturePackerConfig {
  return configSchema.parse(mergeJobDefaults(value)) as TexturePackerConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeJobDefaults(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.jobs)) {
    return value;
  }

  const defaults = isRecord(value.defaults) ? value.defaults : {};
  const defaultInput = isRecord(defaults.input) ? defaults.input : {};
  const defaultOutput = isRecord(defaults.output) ? defaults.output : {};
  const defaultPacker = isRecord(defaults.packer) ? defaults.packer : {};

  return {
    ...value,
    jobs: value.jobs.map((job) => {
      if (!isRecord(job)) {
        return job;
      }
      return {
        ...job,
        input: {
          ...defaultInput,
          ...(isRecord(job.input) ? job.input : {}),
        },
        output: {
          ...defaultOutput,
          ...(isRecord(job.output) ? job.output : {}),
        },
        packer: {
          ...defaultPacker,
          ...(isRecord(job.packer) ? job.packer : {}),
        },
      };
    }),
  };
}
