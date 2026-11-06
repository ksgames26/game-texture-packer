import path from "node:path";
import { Command } from "commander";
import { loadFontConfig } from "./config.js";
import { buildFonts } from "./build.js";
import { setupFontTools } from "./tools.js";
import { exportCocosFonts } from "./cocos.js";

/** 字体命令独立于已有精灵图集配置，避免改变旧任务行为。 */
export function registerFontCommands(program: Command, stdout: (message: string) => void): void {
  const font = program.command("font").description("生成普通位图字体与 Cocos SDF 字体");
  font.command("setup").requiredOption("--config <path>", "字体 JSONC 配置").action(async (options: { config: string }) => {
    const loaded = await loadFontConfig(path.resolve(options.config));
    await setupFontTools(loaded.cacheDirectory);
    stdout(`字体生成器已安装并校验：${loaded.cacheDirectory}\n`);
  });
  font.command("build")
    .requiredOption("--config <path>", "字体 JSONC 配置")
    .option("--mode <mode>", "bitmap 或 sdf")
    .option("--check", "只核对源与生成物指纹")
    .option("--dry-run", "只检查配置与字符表")
    .action(async (options: { config: string; mode?: string; check?: boolean; dryRun?: boolean }) => {
      if (options.mode && options.mode !== "bitmap" && options.mode !== "sdf") throw new Error("mode 必须为 bitmap 或 sdf");
      if (options.check && options.dryRun) throw new Error("check 与 dry-run 不能同时使用");
      const loaded = await loadFontConfig(path.resolve(options.config));
      const buildOptions: { mode?: "bitmap" | "sdf"; check?: boolean; dryRun?: boolean } = {};
      if (options.mode === "bitmap" || options.mode === "sdf") buildOptions.mode = options.mode;
      if (options.check) buildOptions.check = true;
      if (options.dryRun) buildOptions.dryRun = true;
      for (const result of await buildFonts(loaded, buildOptions)) stdout(`[${result.status}] ${result.name}: ${result.glyphCount} 字符\n`);
    });
  font.command("cocos")
    .requiredOption("--config <path>", "字体 JSONC 配置")
    .requiredOption("--output <path>", "Cocos 支持文件目录")
    .option("--check", "检查支持文件与导入设置")
    .action(async (options: { config: string; output: string; check?: boolean }) => {
      const loaded = await loadFontConfig(path.resolve(options.config));
      await exportCocosFonts(loaded, path.resolve(options.output), Boolean(options.check));
      stdout(`Cocos 字体支持${options.check ? "检查通过" : "已同步"}\n`);
    });
}
