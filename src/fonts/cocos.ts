import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type LoadedFontConfig } from "./config.js";
import { buildFonts } from "./build.js";
import { sha256 } from "./tools.js";

type Meta = { uuid: string; importer: string; userData: Record<string, unknown>; subMetas: Record<string, Meta> };

/** 显式 Cocos 导出才创建 meta；已有 UUID、Prefab 和人工材质均不覆盖。 */
export async function exportCocosFonts(loaded: LoadedFontConfig, directory: string, check = false): Promise<void> {
  await buildFonts(loaded, { check: true });
  // dist/fonts 的相邻上级为 dist，作者模板位于包根 cocos。
  const templateDirectory = fileURLToPath(new URL("../../cocos/", import.meta.url));
  const manifestPath = path.join(directory, "font-cocos-build.json");
  const old = await optionalJson<Record<string, string>>(manifestPath) || {};
  const next: Record<string, string> = {};
  for (const filename of ["SdfLabel.ts", "texture-packer-sdf.effect"]) {
    const data = await readFile(path.join(templateDirectory, filename));
    const target = path.join(directory, filename);
    await writeGenerated(target, data, old[filename], check);
    next[filename] = sha256(data);
    await ensureMeta(target, filename.endsWith(".ts") ? "typescript" : "effect", check);
  }
  const effect = await ensureMeta(path.join(directory, "texture-packer-sdf.effect"), "effect", check);
  for (const job of loaded.config.jobs) {
    const output = path.resolve(loaded.root, job.output);
    const png = path.join(output, `${job.name}.png`);
    const meta = await optionalJson<Meta>(png + ".meta");
    if (!meta) {
      if (check) throw new Error(`缺少 Cocos 图片导入设置：${png}`);
      await writeFile(png + ".meta", json(imageMeta(randomUUID(), job.textureSize)));
    } else {
      validateImageMeta(meta, png);
    }
    await ensureMeta(path.join(output, `${job.name}.fnt`), "bitmap-font", check);
    if (job.mode === "sdf") {
      for (const variant of ["sdf", "sdf-outline", "sdf-fallback"]) {
        const filename = `${job.name}-${variant}.mtl`;
        const data = Buffer.from(json({
          __type__: "cc.Material", _name: `${job.name}-${variant}`, _objFlags: 0, __editorExtras__: {}, _native: "",
          _effectAsset: { __uuid__: effect.uuid, __expectedType__: "cc.EffectAsset" }, _techIdx: 0,
          _defines: [{ USE_TEXTURE: true, USE_DERIVATIVES: variant !== "sdf-fallback", USE_OUTLINE: variant === "sdf-outline" }],
          _states: [{}],
          _props: [{
            sdfParams: { __type__: "cc.Vec4", x: 1 / job.textureSize, y: 1 / job.textureSize, z: job.distanceRange, w: 0.5 / job.distanceRange },
            outlineColor: { __type__: "cc.Color", r: 24, g: 24, b: 32, a: 255 },
            outlineParams: { __type__: "cc.Vec4", x: variant === "sdf-outline" ? 1 : 0, y: 0, z: 0, w: 0 },
          }],
        }));
        const key = `${job.name}/${filename}`;
        await writeGenerated(path.join(output, filename), data, old[key], check);
        next[key] = sha256(data);
        await ensureMeta(path.join(output, filename), "material", check);
      }
    }
  }
  if (check) {
    if (JSON.stringify(next) !== JSON.stringify(old)) throw new Error("Cocos 字体支持清单过期");
  } else {
    await writeFile(manifestPath, json(next));
  }
}

async function writeGenerated(filename: string, data: Buffer, previousHash: string | undefined, check: boolean): Promise<void> {
  let existing: Buffer | undefined;
  try { existing = await readFile(filename); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existing && sha256(existing) === sha256(data)) return;
  if (check) throw new Error(`Cocos 字体文件过期：${filename}`);
  if (existing && sha256(existing) !== previousHash) throw new Error(`拒绝覆盖人工修改：${filename}。请修改包内作者源或另存自定义材质。`);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, data);
}

async function ensureMeta(filename: string, importer: string, check: boolean): Promise<Meta> {
  const existing = await optionalJson<Meta>(filename + ".meta");
  if (existing) {
    if (existing.importer !== importer || !existing.uuid) throw new Error(`Cocos meta 类型不符：${filename}`);
    return existing;
  }
  if (check) throw new Error(`缺少 Cocos meta：${filename}`);
  const versions: Record<string, string> = { typescript: "4.0.24", effect: "1.7.1", material: "1.0.21", "bitmap-font": "1.0.6" };
  const meta = { ver: versions[importer], importer, imported: false, uuid: randomUUID(), files: [], subMetas: {}, userData: {} };
  await writeFile(filename + ".meta", json(meta));
  return meta;
}

function imageMeta(uuid: string, size: number): unknown {
  return {
    ver: "1.0.27", importer: "image", imported: false, uuid, files: [],
    subMetas: {
      "6c48a": {
        ver: "1.0.22", importer: "texture", imported: false, uuid: uuid + "@6c48a", id: "6c48a", name: "texture", files: [], subMetas: {},
        userData: { wrapModeS: "clamp-to-edge", wrapModeT: "clamp-to-edge", minfilter: "linear", magfilter: "linear", mipfilter: "none", anisotropy: 0, isUuid: true, imageUuidOrDatabaseUri: uuid, visible: false },
      },
      "f9941": {
        ver: "1.0.12", importer: "sprite-frame", imported: false, uuid: uuid + "@f9941", id: "f9941", name: "spriteFrame", files: [], subMetas: {},
        userData: { trimType: "none", trimThreshold: 1, rotated: false, offsetX: 0, offsetY: 0, trimX: 0, trimY: 0, width: size, height: size, rawWidth: size, rawHeight: size, packable: false, pixelsToUnit: 100, pivotX: 0.5, pivotY: 0.5, meshType: 0, isUuid: true, imageUuidOrDatabaseUri: uuid + "@6c48a", atlasUuid: "" },
      },
    },
    userData: { type: "sprite-frame", fixAlphaTransparencyArtifacts: false, hasAlpha: true, redirect: uuid + "@6c48a" },
  };
}

function validateImageMeta(meta: Meta, filename: string): void {
  const texture = meta.subMetas && meta.subMetas["6c48a"];
  const sprite = meta.subMetas && meta.subMetas["f9941"];
  if (meta.importer !== "image" || meta.userData.type !== "sprite-frame" || meta.userData.fixAlphaTransparencyArtifacts !== false ||
      !texture || texture.userData.minfilter !== "linear" || texture.userData.magfilter !== "linear" || texture.userData.mipfilter !== "none" ||
      texture.userData.wrapModeS !== "clamp-to-edge" || texture.userData.wrapModeT !== "clamp-to-edge" ||
      !sprite || sprite.userData.packable !== false || sprite.userData.trimType !== "none") {
    throw new Error(`字体图片需要 sprite-frame、linear、clamp、无 mipmap、无裁剪、无动态合图、关闭透明修复：${filename}`);
  }
  const compression = meta.userData.compressSettings as { useCompressTexture?: boolean } | undefined;
  if (compression && compression.useCompressTexture) throw new Error(`字体距离数据不能有损压缩：${filename}`);
}

async function optionalJson<T>(filename: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(filename, "utf8")) as T; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function json(value: unknown): string { return JSON.stringify(value, null, 2) + "\n"; }
