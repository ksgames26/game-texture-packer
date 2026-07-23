# game-texture-packer

一个高度可配置的本地图集打包工具。它封装
[`free-tex-packer-core@0.3.8`](https://github.com/odrick/free-tex-packer-core)，提供：

- JSON、JSONC、JavaScript、CommonJS、ES Module 配置
- 单配置多任务、共享默认值、并发和 fail-fast
- glob 输入、ignore、稳定自然排序
- 上游全部公开打包参数和自定义 Mustache exporter
- `--job`、`--set`、`--dry-run`、`--concurrency`
- JSON Schema、完整初始化模板和 TypeScript API
- 输出越界保护及默认禁止覆盖

工具不会创建或修改 Cocos Creator 的 `.meta` 文件。

## 环境

- Node.js >= 20
- pnpm >= 9.12.3

## 安装与构建

作为 `game-push` 子模块使用：

```bash
git submodule update --init --recursive
cd pkgs/game-texture-packer
pnpm install
pnpm run build
```

直接运行：

```bash
node dist/cli.js --help
node dist/cli.js init
node dist/cli.js pack
```

如需任意目录直接使用命令：

```bash
pnpm link --global
game-texture-packer --help
```

## 快速开始

生成包含全部参数和注释的 JSONC 配置：

```bash
game-texture-packer init
```

默认生成 `game-texture-packer.config.jsonc`。已有文件不会被覆盖：

```bash
game-texture-packer init configs/atlas.jsonc
game-texture-packer init configs/atlas.jsonc --force
```

打包、选择任务和 dry-run：

```bash
game-texture-packer
game-texture-packer pack --config configs/atlas.jsonc
game-texture-packer pack --job hero-idle --job effects
game-texture-packer pack --dry-run --verbose
```

临时覆盖任务配置。值优先按 JSON literal 解析，无法解析时作为字符串：

```bash
game-texture-packer pack \
  --job hero-idle \
  --set packer.width=4096 \
  --set packer.height=4096 \
  --set output.overwrite=true
```

`--set` 只允许 `input.*`、`output.*`、`packer.*`，并会经过完整 Schema
复验。指定了 `--job` 时只覆盖所选任务，否则覆盖全部任务。

## 配置发现

未传 `--config` 时，在当前工作目录按顺序查找：

1. `game-texture-packer.config.json`
2. `game-texture-packer.config.jsonc`
3. `game-texture-packer.config.js`
4. `game-texture-packer.config.cjs`
5. `game-texture-packer.config.mjs`

相对路径以配置文件所在目录为起点，再应用顶层 `cwd`。`--cwd` 会同时改变配置
发现目录并覆盖有效工作目录。

## 完整配置示例

可直接参考
[`examples/game-texture-packer.config.jsonc`](examples/game-texture-packer.config.jsonc)：

```jsonc
{
  "$schema": "./schema/game-texture-packer.schema.json",
  "cwd": ".",
  "concurrency": 2,
  "failFast": true,
  "defaults": {
    "input": {
      "ignore": ["**/*.tmp.png"],
      "allowEmpty": false
    },
    "output": {
      "overwrite": false,
      "manifest": true
    },
    "packer": {
      "width": 2048,
      "height": 2048,
      "padding": 2,
      "extrude": 1,
      "packer": "OptimalPacker",
      "packerMethod": "Automatic",
      "exporter": "Cocos2d"
    }
  },
  "jobs": [
    {
      "name": "hero-idle",
      "input": {
        "cwd": "arts/hero/idle",
        "files": ["**/*.png"]
      },
      "output": {
        "directory": "assets/atlases/hero"
      },
      "packer": {
        "textureName": "hero-idle"
      }
    }
  ]
}
```

`defaults.input`、`defaults.output` 和 `defaults.packer` 会分别与任务配置浅合并；
任务字段优先。

## 顶层、输入与输出参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `$schema` | `string` | 无 | JSON Schema 路径，仅供编辑器使用 |
| `cwd` | `string` | 配置目录 | 所有任务相对路径的基础目录 |
| `concurrency` | 正整数 | `1` | 最大并发任务数 |
| `failFast` | `boolean` | `true` | 首次失败后停止调度新任务 |
| `defaults` | `object` | `{}` | 任务共享默认值 |
| `jobs` | `array` | 必填 | 具名打包任务，名称必须唯一 |
| `input.files` | `string \| string[]` | 必填 | fast-glob 模式 |
| `input.ignore` | `string \| string[]` | `[]` | 排除模式 |
| `input.cwd` | `string` | 顶层 `cwd` | 输入搜索目录 |
| `input.allowEmpty` | `boolean` | `false` | 无匹配时跳过 |
| `input.followSymbolicLinks` | `boolean` | `false` | 是否跟随符号链接 |
| `input.caseSensitiveMatch` | `boolean` | `false` | glob 是否区分大小写 |
| `output.directory` | `string` | 必填 | 图集输出目录 |
| `output.overwrite` | `boolean` | `false` | 是否允许覆盖已有文件 |
| `output.manifest` | `boolean \| string` | `false` | 默认 manifest 或输出目录内路径 |

输入会去重，并按规范化的 `/` 相对路径做自然排序。绝对输出名、空文件名和包含
`..` 的越界路径会被拒绝；工具不会递归清空输出目录。

## Packer 参数

### 命名与尺寸

| 参数 | 类型 | 上游默认值 | 说明 |
| --- | --- | --- | --- |
| `textureName` | `string` | `pack-result` | 输出文件基础名 |
| `suffix` | `string` | `-` | 多图集编号分隔符 |
| `suffixInitialValue` | 非负整数 | `0` | 多图集起始编号 |
| `width` | 正整数 | `2048` | 单张图集最大宽度 |
| `height` | 正整数 | `2048` | 单张图集最大高度 |
| `fixedSize` | `boolean` | `false` | 固定输出尺寸 |
| `powerOfTwo` | `boolean` | `false` | 输出尺寸取 2 的幂 |
| `padding` | 非负整数 | `0` | Sprite 周围间距 |
| `extrude` | 非负整数 | `0` | 向外扩展边缘像素 |

### Sprite 处理

| 参数 | 类型 | 上游默认值 | 说明 |
| --- | --- | --- | --- |
| `allowRotation` | `boolean` | `true` | 允许旋转；exporter 不支持时上游会关闭 |
| `detectIdentical` | `boolean` | `true` | 合并完全相同的图片 |
| `allowTrim` | `boolean` | `true` | 裁剪透明边缘 |
| `trimMode` | `trim \| crop` | `trim` | 保留原始尺寸信息，或同步缩小原始尺寸 |
| `alphaThreshold` | `0..255` | `0` | 透明裁剪阈值 |
| `removeFileExtension` | `boolean` | `false` | frame 名移除扩展名 |
| `prependFolderName` | `boolean` | `true` | frame 名前保留目录 |

### 纹理、缩放与压缩

| 参数 | 类型 | 上游默认值 | 说明 |
| --- | --- | --- | --- |
| `textureFormat` | `png \| jpg \| webp` | `png` | 纹理格式 |
| `base64Export` | `boolean` | `false` | 纹理嵌入描述文件 |
| `scale` | 正数 | `1` | 输出尺寸和坐标缩放 |
| `scaleMethod` | 枚举 | `BILINEAR` | `BILINEAR`、`NEAREST_NEIGHBOR`、`BICUBIC`、`HERMITE`、`BEZIER` |
| `tinify` | `boolean` | `false` | 使用 TinyPNG 压缩 |
| `tinifyKey` | `string` | 空字符串 | 明文 TinyPNG key |
| `tinifyKeyEnv` | `string` | 无 | 从环境变量读取 key，优先于明文 |

推荐避免提交密钥：

```jsonc
{
  "packer": {
    "tinify": true,
    "tinifyKeyEnv": "TINYPNG_API_KEY"
  }
}
```

### 算法

| `packer` | 可用 `packerMethod` |
| --- | --- |
| `MaxRectsBin` | `BestShortSideFit`、`BestLongSideFit`、`BestAreaFit`、`BottomLeftRule`、`ContactPointRule` |
| `MaxRectsPacker` | `Smart`、`Square`、`SmartSquare`、`SmartArea`、`SquareArea`、`SmartSquareArea` |
| `OptimalPacker` | `Automatic` |

`OptimalPacker + Automatic` 会尝试多种 MaxRects 组合，空间利用率通常更高，但耗时也更高。

### Exporter、过滤和元信息

`exporter` 支持：

`JsonHash`、`JsonArray`、`Css`、`OldCss`、`Pixi`、`GodotAtlas`、
`GodotTileset`、`PhaserHash`、`PhaserArray`、`Phaser3`、`XML`、
`Starling`、`Cocos2d`、`Spine`、`Unreal`、`UIKit`、`Unity3D`、`Egret2D`。

自定义 Mustache exporter 必须二选一提供 `template` 或 `content`：

```jsonc
{
  "packer": {
    "exporter": {
      "fileExt": "json",
      "template": "templates/custom-atlas.mst"
    }
  }
}
```

`filter` 为 `none`、`grayscale` 或 `mask`。`appInfo` 包含 `url`、`version`，
可选 `displayName`。

## JavaScript 配置

ES Module：

```js
import { defineConfig } from "game-texture-packer";

export default defineConfig({
  jobs: [{
    name: "main",
    input: { files: ["textures/**/*.png"] },
    output: { directory: "atlases" },
    packer: { exporter: "Cocos2d" }
  }]
});
```

CommonJS 使用 `module.exports = { ... }`。配置中任意字符串都支持严格的
`${ENV_NAME}` 展开；变量不存在时立即失败。

## 可编程 API

```ts
import {
  applyJobOverrides,
  loadConfig,
  normalizeConfig,
  runConfig
} from "game-texture-packer";

const loaded = await loadConfig("./game-texture-packer.config.jsonc");
const overridden = applyJobOverrides(
  loaded.config,
  ["packer.width=4096"],
  ["hero-idle"]
);
const config = await normalizeConfig(overridden, loaded.path);
const summary = await runConfig(config, {
  selectedJobs: ["hero-idle"]
});
```

主入口还导出 `parseConfig`、`discoverInputs`、`packJob`、`defineConfig`、全部公开类型和
枚举常量。

## Cocos Creator

- 推荐 `exporter: "Cocos2d"`。
- 工具只生成上游 exporter 的纹理和描述文件。
- Cocos Creator 的资源数据库应自行导入/刷新输出目录。
- 已存在的 `.meta` 不会被读取、修改或删除。
- 若 Cocos 版本对 plist 格式有额外约束，可使用自定义 Mustache exporter。

## 常见问题

- 无输入：默认失败；确实允许空任务时设置 `input.allowEmpty: true`。
- 文件已存在：确认后设置 `output.overwrite: true`。
- 多张图集：使用 `suffix` 和 `suffixInitialValue` 控制 `atlas-0.png` 一类名称。
- TinyPNG 失败：检查 key、环境变量和网络，避免把密钥提交进配置。

## 开发

```bash
pnpm install
pnpm test
pnpm run lint
pnpm run build
node dist/cli.js --help
```

## 许可证与上游

本仓库使用 MIT License。核心打包能力来自同为 MIT License 的
[`odrick/free-tex-packer-core`](https://github.com/odrick/free-tex-packer-core)；
详见 [NOTICE](NOTICE)。
