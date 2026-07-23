# Game Texture Packer 设计说明

## 目标

在 `pkgs/game-texture-packer` 提供一个独立、可复用的本地图集打包工具。工具封装 `free-tex-packer-core@0.3.8`，通过配置文件描述输入、输出和打包参数，既适合 Cocos Creator 项目，也保留上游全部 exporter 与自定义 Mustache exporter 能力。

## 交付边界

- 独立 Git 仓库，作为 `game-push` 的子模块接入。
- Node.js 20+、TypeScript、pnpm。
- 提供 `game-texture-packer` 命令行和可编程 API。
- 支持 JSON、JSONC、JavaScript、CommonJS、ES Module 配置。
- 支持单配置多任务、共享默认值、按任务筛选、CLI 覆盖、dry-run。
- 支持上游全部公开选项，并为枚举和数值范围提供运行时校验。
- 提供 JSON Schema、完整示例、初始化命令和中文 README。
- 不处理 Cocos Creator `.meta` 文件；工具只生成上游 exporter 对应的图集纹理与描述文件。
- 首版不提供 GUI、常驻 watch 进程或远程服务。

## 用户体验

典型调用：

```bash
pnpm game-texture-packer init
pnpm game-texture-packer pack --config game-texture-packer.config.jsonc
pnpm game-texture-packer pack --job hero-idle --dry-run
```

默认查找以下文件，命中第一个即停止：

1. `game-texture-packer.config.json`
2. `game-texture-packer.config.jsonc`
3. `game-texture-packer.config.js`
4. `game-texture-packer.config.cjs`
5. `game-texture-packer.config.mjs`

JavaScript 配置可从包入口导入 `defineConfig`，获得类型提示。JSON/JSONC 配置通过随包发布的 JSON Schema 获得编辑器提示。

## 配置结构

顶层配置包含：

- `cwd`：所有相对路径的基础目录，默认配置文件目录。
- `concurrency`：任务并发数，默认 `1`。
- `failFast`：任一任务失败后是否停止调度，默认 `true`。
- `defaults`：合并到每个任务的默认输入、输出和 packer 参数。
- `jobs`：一个或多个具名任务。

任务包含：

- `name`：唯一任务名。
- `enabled`：是否参与默认执行。
- `input`：glob、忽略规则、搜索目录、软链接策略和空输入策略。
- `output`：输出目录、覆盖策略和是否写入 manifest。
- `packer`：传给 `free-tex-packer-core` 的参数。

`packer` 覆盖上游公开参数：

- 文件命名：`textureName`、`suffix`、`suffixInitialValue`。
- 尺寸布局：`width`、`height`、`fixedSize`、`powerOfTwo`、`padding`、`extrude`。
- Sprite 处理：`allowRotation`、`detectIdentical`、`allowTrim`、`trimMode`、`alphaThreshold`、`removeFileExtension`、`prependFolderName`。
- 纹理输出：`textureFormat`、`base64Export`、`scale`、`scaleMethod`。
- 压缩：`tinify`、`tinifyKey`、包装层提供的 `tinifyKeyEnv`。
- 算法：`packer`、`packerMethod`。
- 描述输出：全部内置 `exporter` 名称，或 `{ fileExt, template, content }` 自定义 exporter。
- 过滤与元信息：`filter`、`appInfo`。

所有路径相对配置的有效 `cwd` 解析。输入文件按规范化相对路径稳定排序，再传入上游，确保同一输入和配置的顺序可重复。`${ENV_NAME}` 字符串在校验前展开；缺失环境变量直接报错。`tinifyKeyEnv` 用于避免把 TinyPNG 密钥写进仓库，并优先于明文 `tinifyKey`。

## 架构与模块

- `src/config/types.ts`：公开配置类型与 `defineConfig`。
- `src/config/schema.ts`：Zod 配置校验、默认值和枚举定义。
- `src/config/load-config.ts`：配置发现、JSON/JSONC/JS 加载、环境变量展开。
- `src/config/normalize-config.ts`：defaults/job 深合并、路径和自定义模板解析、任务筛选。
- `src/input/discover-inputs.ts`：glob 搜索、去重、稳定排序和 Buffer 读取。
- `src/packer/pack-job.ts`：调用 `packAsync`、验证上游输出文件名并写文件。
- `src/runner/run-config.ts`：并发调度、fail-fast、dry-run 和汇总结果。
- `src/cli.ts`：`init`、`pack`、日志与退出码。
- `src/index.ts`：导出稳定的可编程 API。

CLI 只负责参数解析和展示。配置、发现、打包和写入均通过可注入的函数边界实现，测试不依赖启动子进程。

## 数据流

1. CLI 定位配置文件，或使用 `--config` 指定文件。
2. loader 读取模块/文本并展开环境变量。
3. schema 校验结构和参数组合。
4. normalizer 合并 defaults，解析相对路径及自定义 exporter 模板。
5. runner 根据 `--job` 选择任务，并按 `concurrency` 调度。
6. input 模块发现并读取图片，生成上游 `{ path, contents }`。
7. packer 调用 `packAsync`，将返回文件安全写入任务输出目录。
8. 可选写入 manifest，CLI 汇总每个任务的输入和输出。

## 安全与错误处理

- 拒绝绝对输出文件名以及包含 `..` 的上游输出名，防止越界写入。
- 输出目录可自动创建；已有文件且 `overwrite: false` 时任务失败。
- 不自动递归清空输出目录，避免误删用户资源。
- glob 无匹配时默认失败；可通过 `input.allowEmpty: true` 跳过。
- 配置错误携带字段路径；文件系统错误携带任务名和目标路径。
- `packAsync` 抛出的错误保留 cause，并补充任务上下文。
- dry-run 完成配置和输入检查，但不调用上游打包器、不写文件。
- 退出码：全部成功为 `0`，配置或任一任务失败为 `1`。

## 测试策略

- 配置测试：发现顺序、JSONC、JS 配置、默认值、环境变量、无效枚举、重复任务名。
- 规范化测试：defaults 合并、相对路径、自定义模板、任务筛选。
- 输入测试：glob、ignore、去重、稳定排序、空输入。
- 打包测试：使用最小 PNG 真实调用 `free-tex-packer-core`，验证纹理和描述文件落盘。
- 安全测试：拒绝路径穿越、禁止覆盖、dry-run 不写文件。
- CLI 测试：`init`、配置缺失、任务筛选及失败退出码。
- 交付验证：`pnpm test`、`pnpm run lint`、`pnpm run build`、打包产物 smoke test。

## 兼容与发布

- 包名和命令名均为 `game-texture-packer`。
- 使用 ESM 输出，同时通过 `exports` 暴露主入口、配置类型和 JSON Schema。
- 仓库标记为 `private: true`，避免本地工具误发布；如未来需要发布 npm 包，可单独去除限制。
- 上游许可证为 MIT；仓库 README 和 NOTICE 明确依赖来源。
