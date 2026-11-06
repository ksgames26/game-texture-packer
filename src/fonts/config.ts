import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse, type ParseError } from "jsonc-parser";
import { z } from "zod";

const fontJobSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  mode: z.enum(["bitmap", "sdf"]),
  font: z.string().min(1),
  charsetFiles: z.array(z.string().min(1)).min(1),
  output: z.string().min(1),
  size: z.number().int().min(8).max(256).default(48),
  textureSize: z.number().int().min(64).max(4096).default(2048),
  distanceRange: z.number().min(2).max(32).default(8),
  overwrite: z.boolean().default(false),
}).strict();

export const fontConfigSchema = z.object({
  $schema: z.string().optional(),
  cwd: z.string().default("."),
  cacheDirectory: z.string().default(".cache/font-tools"),
  jobs: z.array(fontJobSchema).min(1),
}).strict().superRefine((config, context) => {
  const names = new Set<string>();
  for (const job of config.jobs) {
    if (names.has(job.name)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `字体任务重名：${job.name}` });
    }
    names.add(job.name);
  }
});

export type FontJob = z.infer<typeof fontJobSchema>;
export type FontConfig = z.infer<typeof fontConfigSchema>;
export interface LoadedFontConfig {
  config: FontConfig;
  root: string;
  cacheDirectory: string;
}

/** 从 JSON/JSONC 读取字体任务，所有路径相对配置所在目录解析。 */
export async function loadFontConfig(filename: string): Promise<LoadedFontConfig> {
  const errors: ParseError[] = [];
  const value: unknown = parse(await readFile(filename, "utf8"), errors, { allowTrailingComma: true });
  if (errors.length) throw new Error(`字体配置 JSON 解析失败：${filename}`);
  const config = fontConfigSchema.parse(value);
  const root = path.resolve(path.dirname(filename), config.cwd);
  const outputs = new Set<string>();
  for (const job of config.jobs) {
    const target = path.resolve(root, job.output, job.name).toLowerCase();
    if (outputs.has(target)) throw new Error(`字体输出重复：${target}`);
    outputs.add(target);
  }
  return { config, root, cacheDirectory: path.resolve(root, config.cacheDirectory) };
}

/** 字符表按 Unicode 排序去重；换行、制表符与 BOM 仅用于维护排版。 */
export function normalizeCharset(text: string): string {
  const points = new Set<number>();
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (code < 32 || (code >= 127 && code <= 159) || code === 0xfeff) continue;
    // Creator 3.8 的 BMFont 排版按 UTF-16 字符索引，本适配器明确拒绝代理对。
    if (code > 0xffff || (code >= 0xd800 && code <= 0xdfff)) {
      throw new Error(`Cocos BMFont 字符表仅支持 BMP 字符：U+${code.toString(16).toUpperCase()}`);
    }
    points.add(code);
  }
  if (points.size === 0) throw new Error("字符表为空");
  return Array.from(points).sort((a, b) => a - b).map(code => String.fromCharCode(code)).join("");
}
