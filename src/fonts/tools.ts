import { createHash } from "node:crypto";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";

export type FontToolName = "fontbm" | "msdf-atlas-gen";
interface ToolRelease {
  version: string;
  url: string;
  sha256: string;
  executable: string;
  archivePrefix: string;
  files: Record<string, string>;
}

/** 固定官方版本及发布包和解包文件哈希；升级必须显式更新并重新验收。 */
export const FONT_TOOLS: Record<FontToolName, ToolRelease> = {
  fontbm: {
    version: "0.7.1",
    url: "https://github.com/vladimirgamalyan/fontbm/releases/download/v0.7.1/fontbm.zip",
    sha256: "f2c9f75cbe775bd6e4030314b3efab85769ab736be6466b2b5807d8ace8a9926",
    executable: "fontbm.exe",
    archivePrefix: "",
    files: {
      "fontbm.exe": "21e4e2d52c40a5ee2e6288b4a3cb691864f932d91d9042c35f7ab343c22865f3",
      "brotlicommon.dll": "ad1d1f828567b1c7fc0ed31fff385592b20c8a713280d4d3366cccf218da2f7f",
      "brotlidec.dll": "f1e7815f0a535dd37c2d284dae0f00280d8bf966cea1a85db0d7f0cfe13f33ad",
      "bz2.dll": "dad003d38100a12f9663e41ccdd39bd0590b0282e65ee70d7214958a1b072785",
      "freetype.dll": "1660bd4fc9d9cd083b9db819c385667b03a21a6a7e35f6f9d2f4721238a36112",
      "libpng16.dll": "c74b6d4438955045d150a9c1b2bd6a3a7592d82f2de1ccc78b53730795cb054a",
      "zlib1.dll": "a410e201036470e0224aa8c6a5790d7fa7f427387e454d5d364cd4bc269c4f02",
    },
  },
  "msdf-atlas-gen": {
    version: "1.4",
    url: "https://github.com/Chlumsky/msdf-atlas-gen/releases/download/v1.4/msdf-atlas-gen-1.4-win64.zip",
    sha256: "55ab2bef57b9c7bf305b610989fa8eeda812d85bc93e632b8c39ce05b6e64e9d",
    executable: "msdf-atlas-gen.exe",
    archivePrefix: "msdf-atlas-gen/",
    files: { "msdf-atlas-gen.exe": "92ea31177dcc375b350436b64f704b17c87c67ba4578d1b235c0cf7df0ea1510" },
  },
};

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function toolDirectory(cacheDirectory: string, name: FontToolName): string {
  return path.join(cacheDirectory, `${name}-${FONT_TOOLS[name].version}-win32-x64`);
}

/** 仅 setup 命令访问网络，构建与检查不会隐式下载工具。 */
export async function setupFontTools(cacheDirectory: string): Promise<void> {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("自动安装当前支持 Windows x64；其他平台请配置 FONTBM_BIN / MSDF_ATLAS_GEN_BIN");
  }
  for (const name of Object.keys(FONT_TOOLS) as FontToolName[]) {
    const release = FONT_TOOLS[name];
    const directory = toolDirectory(cacheDirectory, name);
    await mkdir(directory, { recursive: true });
    const archivePath = path.join(directory, "release.zip");
    let archive: Buffer;
    try {
      archive = await readFile(archivePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      try {
        const response = await fetch(release.url, { signal: controller.signal });
        if (!response.ok) throw new Error(`下载失败：${response.status} ${release.url}`);
        archive = Buffer.from(await response.arrayBuffer());
      } finally {
        clearTimeout(timeout);
      }
      if (sha256(archive) !== release.sha256) throw new Error(`${name} 发布包 SHA-256 不符`);
      await writeFile(archivePath, archive);
    }
    if (sha256(archive) !== release.sha256) throw new Error(`${archivePath} SHA-256 不符，请移走损坏缓存后重试`);
    const entries = unzipSync(archive);
    // 只提取固定白名单，绝不使用 ZIP 内路径作为输出路径。
    for (const [filename, digest] of Object.entries(release.files)) {
      const data = entries[release.archivePrefix + filename];
      if (!data || sha256(data) !== digest) throw new Error(`${name}/${filename} SHA-256 不符`);
      const target = path.join(directory, filename);
      await writeFile(target, data);
      await chmod(target, 0o755);
    }
  }
}

/** 自定义二进制允许跨平台，构建清单仍记录其真实 SHA-256。 */
export async function resolveFontTool(cacheDirectory: string, name: FontToolName): Promise<{ filename: string; hash: string; version: string }> {
  const override = process.env[name === "fontbm" ? "FONTBM_BIN" : "MSDF_ATLAS_GEN_BIN"];
  const release = FONT_TOOLS[name];
  if (override) {
    const filename = path.resolve(override);
    return { filename, hash: sha256(await readFile(filename)), version: "custom" };
  }
  const directory = toolDirectory(cacheDirectory, name);
  const filename = path.join(directory, release.executable);
  try {
    await access(filename);
  } catch {
    throw new Error(`${name} 未安装，请先运行 font setup --config <配置文件>`);
  }
  for (const [file, digest] of Object.entries(release.files)) {
    if (sha256(await readFile(path.join(directory, file))) !== digest) {
      throw new Error(`${name}/${file} 校验失败，请重新运行 font setup`);
    }
  }
  return { filename, hash: release.files[release.executable]!, version: release.version };
}
