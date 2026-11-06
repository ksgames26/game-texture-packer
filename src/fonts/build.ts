import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { type FontJob, type LoadedFontConfig, normalizeCharset } from "./config.js";
import { FONT_TOOLS, resolveFontTool, sha256, type FontToolName } from "./tools.js";
import { sdfToBmfont, validateBmfont, type SdfAtlas } from "./bmfont.js";

const execute = promisify(execFile);

export interface FontBuildResult {
  name: string;
  mode: string;
  glyphCount: number;
  files: string[];
  status: "built" | "checked" | "planned";
}

interface Manifest {
  formatVersion: number;
  fingerprint: string;
  glyphCount: number;
  generator: { name: string; version: string; sha256: string; platform: string };
  files: Record<string, string>;
}

export async function fontImplementationHash(): Promise<string> {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const extension = path.extname(fileURLToPath(import.meta.url));
  const sources = await Promise.all(["build", "config", "bmfont", "tools"].map(file => readFile(path.join(directory, file + extension))));
  return sha256(Buffer.concat(sources));
}

/** 在临时目录完整生成并检查后发布；不会递归清空输出目录或修改已有 meta。 */
export async function buildFonts(loaded: LoadedFontConfig, options: { mode?: "bitmap" | "sdf"; check?: boolean; dryRun?: boolean } = {}): Promise<FontBuildResult[]> {
  const jobs = loaded.config.jobs.filter(job => !options.mode || job.mode === options.mode);
  if (!jobs.length) throw new Error("没有匹配的字体任务");
  const implementation = await fontImplementationHash();
  const results: FontBuildResult[] = [];
  for (const job of jobs) {
    const font = await readFile(path.resolve(loaded.root, job.font));
    const texts = await Promise.all(job.charsetFiles.map(file => readFile(path.resolve(loaded.root, file), "utf8")));
    const charset = normalizeCharset(texts.join("\n"));
    const toolName: FontToolName = job.mode === "bitmap" ? "fontbm" : "msdf-atlas-gen";
    const fingerprint = sha256(JSON.stringify({
      implementation, font: sha256(font), charset,
      mode: job.mode, name: job.name, size: job.size,
      textureSize: job.textureSize, distanceRange: job.distanceRange,
      toolVersion: FONT_TOOLS[toolName].version,
    }));
    const output = path.resolve(loaded.root, job.output);
    const manifestPath = path.join(output, `${job.name}.font-build.json`);
    const filenames = [`${job.name}.png`, `${job.name}.fnt`];
    if (job.mode === "sdf") filenames.push(`${job.name}.sdf.json`);
    if (options.check) {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
      if (manifest.formatVersion !== 1 || manifest.fingerprint !== fingerprint) throw new Error(`${job.name} 生成物过期，请重新构建字体`);
      if (Object.keys(manifest.files).sort().join(",") !== filenames.slice().sort().join(",")) throw new Error(`${job.name} 生成清单不完整`);
      for (const filename of filenames) {
        if (sha256(await readFile(path.join(output, filename))) !== manifest.files[filename]) throw new Error(`${job.name} 产物被修改或损坏：${filename}`);
      }
      results.push({ name: job.name, mode: job.mode, glyphCount: charset.length, files: filenames, status: "checked" });
      continue;
    }
    if (options.dryRun) {
      results.push({ name: job.name, mode: job.mode, glyphCount: charset.length, files: filenames, status: "planned" });
      continue;
    }
    const tool = await resolveFontTool(loaded.cacheDirectory, toolName);
    if (!job.overwrite) {
      for (const filename of [...filenames, path.basename(manifestPath)]) {
        try {
          await readFile(path.join(output, filename));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw error;
        }
        throw new Error(`输出已存在：${filename}，请在配置中显式设置 overwrite`);
      }
    }
    await mkdir(loaded.cacheDirectory, { recursive: true });
    const temporary = await mkdtemp(path.join(loaded.cacheDirectory, "build-"));
    try {
      // 使用纯 ASCII 临时文件名，兼容 Windows 上游工具的文件名编码。
      await writeFile(path.join(temporary, "source.ttf"), font);
      await writeFile(path.join(temporary, "charset.txt"), job.mode === "sdf"
        ? Array.from(charset).map(char => char.charCodeAt(0)).join(",") : charset);
      const args = makeArguments(job);
      let generatorLog = "";
      try {
        const execution = await execute(tool.filename, args, { cwd: temporary, windowsHide: true, timeout: 300000, maxBuffer: 8 * 1024 * 1024 });
        generatorLog = execution.stdout + "\n" + execution.stderr;
      } catch (error) {
        const details = error as Error & { stdout?: string; stderr?: string };
        throw new Error(`${job.name} 生成失败：${details.message}\n${details.stdout || ""}\n${details.stderr || ""}`);
      }
      const readGenerated = async (filename: string): Promise<Buffer> => {
        try { return await readFile(path.join(temporary, filename)); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          throw new Error(`${job.name} 生成失败：缺少 ${filename}。生成器输出：${generatorLog}`);
        }
      };
      const buffers: Record<string, Buffer> = {};
      buffers[`${job.name}.png`] = await readGenerated(`${job.name}.png`);
      let fnt: string;
      if (job.mode === "sdf") {
        const raw = await readGenerated(`${job.name}.sdf.json`);
        const source = JSON.parse(raw.toString("utf8")) as SdfAtlas;
        if (source.atlas.size !== job.size || source.atlas.distanceRange !== job.distanceRange) throw new Error("SDF 生成器更改了请求尺寸或距离范围");
        fnt = sdfToBmfont(source, job.name);
        buffers[`${job.name}.sdf.json`] = raw;
      } else {
        fnt = (await readGenerated(`${job.name}.fnt`)).toString("utf8").replace(/\r\n/g, "\n");
        fnt = fnt.replace(/\bsize=-?(\d+)/, "size=$1");
      }
      validateBmfont(fnt, charset, job.name, job.textureSize);
      buffers[`${job.name}.fnt`] = Buffer.from(fnt);
      const manifest: Manifest = {
        formatVersion: 1, fingerprint, glyphCount: charset.length,
        generator: { name: toolName, version: tool.version, sha256: tool.hash, platform: `${process.platform}-${process.arch}` },
        files: {},
      };
      for (const filename of filenames) manifest.files[filename] = sha256(buffers[filename]!);
      await mkdir(output, { recursive: true });
      for (const filename of filenames) await writeFile(path.join(output, filename), buffers[filename]!);
      // 清单最后写入；中途失败的产物不能通过 check。
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      results.push({ name: job.name, mode: job.mode, glyphCount: charset.length, files: filenames, status: "built" });
    } finally {
      const relative = path.relative(loaded.cacheDirectory, temporary);
      if (!relative.startsWith("..") && !path.isAbsolute(relative) && relative.startsWith("build-")) {
        await rm(temporary, { recursive: true, force: true });
      }
    }
  }
  return results;
}

function makeArguments(job: FontJob): string[] {
  if (job.mode === "bitmap") return [
    "--font-file", "source.ttf", "--chars-file", "charset.txt", "--font-size", String(job.size),
    "--texture-size", `${job.textureSize}x${job.textureSize}`, "--max-texture-count", "1",
    "--texture-name-suffix", "none", "--data-format", "txt", "--kerning-pairs", "basic",
    "--padding-up", "1", "--padding-right", "1", "--padding-down", "1", "--padding-left", "1",
    "--spacing-horiz", "2", "--spacing-vert", "2", "--output", job.name,
  ];
  return [
    "-font", "source.ttf", "-charset", "charset.txt", "-type", "sdf", "-format", "png",
    "-size", String(job.size), "-pxrange", String(job.distanceRange), "-pxalign", "on",
    "-outerpxpadding", "2", "-dimensions", String(job.textureSize), String(job.textureSize),
    "-yorigin", "bottom", "-threads", "1", "-imageout", `${job.name}.png`, "-json", `${job.name}.sdf.json`,
  ];
}
