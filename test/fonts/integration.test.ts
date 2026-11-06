import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFonts } from "../../src/fonts/build.js";
import { loadFontConfig } from "../../src/fonts/config.js";
import { exportCocosFonts } from "../../src/fonts/cocos.js";

const fixture = process.env.FONT_TEST_CONFIG;

describe.skipIf(!fixture)("真实字体生成器集成", () => {
  it("两种模式可重复生成，检查缺字/越界/过期与人工修改保护", async () => {
    const loaded = await loadFontConfig(fixture!);
    const temporary = await mkdtemp(path.join(loaded.cacheDirectory, "test-"));
    try {
      const charsetPath = path.join(temporary, "chars.txt");
      await writeFile(charsetPath, " Ag中!\n");
      const configPath = path.join(temporary, "fonts.json");
      await writeFile(configPath, JSON.stringify({
        cacheDirectory: loaded.cacheDirectory,
        jobs: loaded.config.jobs.map(job => ({ ...job, font: path.resolve(loaded.root, job.font), charsetFiles: [charsetPath], textureSize: 256, output: path.join(temporary, job.mode) })),
      }));
      const config = await loadFontConfig(configPath);
      await buildFonts(config);
      await buildFonts(config, { check: true });
      const before = await Promise.all(config.config.jobs.map(job => readFile(path.join(job.output, `${job.name}.png`))));
      await buildFonts(config);
      const after = await Promise.all(config.config.jobs.map(job => readFile(path.join(job.output, `${job.name}.png`))));
      expect(after).toEqual(before);
      const runtime = path.join(temporary, "runtime");
      await exportCocosFonts(config, runtime);
      await exportCocosFonts(config, runtime, true);
      const meta = await readFile(path.join(runtime, "SdfLabel.ts.meta"));
      await exportCocosFonts(config, runtime);
      expect(await readFile(path.join(runtime, "SdfLabel.ts.meta"))).toEqual(meta);
      await writeFile(path.join(runtime, "SdfLabel.ts"), "// 人工改动\n");
      await expect(exportCocosFonts(config, runtime)).rejects.toThrow(/拒绝覆盖人工修改/);
      const bitmap = config.config.jobs.find(job => job.mode === "bitmap")!;
      const target = path.join(bitmap.output, `${bitmap.name}.png`);
      await writeFile(target, "损坏的图像");
      await expect(buildFonts(config, { check: true })).rejects.toThrow(/损坏/);
      await buildFonts(config);
      await writeFile(charsetPath, " Ag中!\nB");
      await expect(buildFonts(config, { check: true })).rejects.toThrow(/过期/);
      await writeFile(charsetPath, "\uffff");
      for (const mode of ["bitmap", "sdf"] as const) {
        await expect(buildFonts(config, { mode })).rejects.toThrow(/缺少|生成失败/);
      }
      // 失败的构建不能覆盖原图。
      expect(await readFile(target)).toEqual(before[0]);
      await writeFile(charsetPath, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789");
      for (const job of config.config.jobs) job.textureSize = 64;
      for (const mode of ["bitmap", "sdf"] as const) {
        await expect(buildFonts(config, { mode })).rejects.toThrow(/生成失败|缺少/);
      }
    } finally {
      const relative = path.relative(loaded.cacheDirectory, temporary);
      if (!relative.startsWith("..") && !path.isAbsolute(relative) && relative.startsWith("test-")) await rm(temporary, { recursive: true, force: true });
    }
  }, 120000);
});
