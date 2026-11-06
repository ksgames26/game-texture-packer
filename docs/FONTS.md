# 位图字体与 Cocos SDF 字体

字体生成是独立子命令，原有 `pack` 图集配置保持兼容。普通位图由
[fontbm 0.7.1](https://github.com/vladimirgamalyan/fontbm/releases/tag/v0.7.1) 生成；
单通道 SDF 由 [msdf-atlas-gen 1.4](https://github.com/Chlumsky/msdf-atlas-gen/releases/tag/v1.4)
从字体矢量轮廓离线生成，不从小尺寸位图反推距离。

## 所有权与命令

- `src/fonts/`：配置、字符表、工具安装校验、生成器调用、FNT 转换和 Cocos 导出。
- `cocos/SdfLabel.ts`、`cocos/texture-packer-sdf.effect`：Cocos 实现的唯一作者源。
- `cocos/validate-runtime.mjs`：独立 Creator 预览内的显示、启停恢复与合批验收。
- 消费游戏维护自己的字体文件、字符表和 JSONC 配置，包内不包含业务字体。
- `font cocos` 导出的组件、Shader 和默认材质属于生成物。修改作者源后重导；
  自定义材质请复制为另一个名字。导出器拒绝覆盖不符合上次清单的人工修改。

```bash
game-texture-packer font setup --config game-fonts.config.jsonc
game-texture-packer font build --config game-fonts.config.jsonc
game-texture-packer font build --config game-fonts.config.jsonc --mode bitmap
game-texture-packer font build --config game-fonts.config.jsonc --mode sdf
game-texture-packer font build --config game-fonts.config.jsonc --dry-run
game-texture-packer font build --config game-fonts.config.jsonc --check
game-texture-packer font cocos --config game-fonts.config.jsonc --output assets/font-runtime
game-texture-packer font cocos --config game-fonts.config.jsonc --output assets/font-runtime --check
```

`setup` 是唯一访问网络的字体命令。Windows x64 自动下载官方固定发布包，核对 ZIP
和每个 EXE/DLL 的 SHA-256；缓存应放在忽略目录，不提交二进制。构建前再次核对工具。
其他平台可设置 `FONTBM_BIN` / `MSDF_ATLAS_GEN_BIN` 为本地编译的绝对路径；清单会标记
`custom` 并记录二进制哈希，跨平台字形栅格化结果需单独验收，不能当作 Windows 已验证版本。

## 配置

```jsonc
{
  "cwd": ".",
  "cacheDirectory": ".cache/font-tools",
  "jobs": [{
    "name": "ui-sdf",
    "mode": "sdf",
    "font": "art/fonts/ui.ttf",
    "charsetFiles": ["art/fonts/ascii.txt", "art/fonts/ui.txt"],
    "output": "assets/fonts/ui-sdf",
    "size": 48,
    "textureSize": 1024,
    "distanceRange": 8,
    "overwrite": true
  }]
}
```

路径相对配置所在目录加 `cwd`。`mode` 为 `bitmap` 或 `sdf`；`size` 默认 48，
`textureSize` 默认 2048，`distanceRange` 默认 8，`overwrite` 默认 false。
每个字体固定一张正方形纹理，超出容量报错，不静默减小字号或拆多页。

字符表是 UTF-8 纯文本，没有注释语法。任意顺序，可按页面分行；自动排序去重，忽略
换行、制表符和 BOM，保留空格。引擎 BMFont 按 UTF-16 索引，本适配器仅允许 BMP 字符，
拒绝 emoji/代理对。字体缺字报错，不能用方框字形假装生成成功。

输出 `<name>.png`、`<name>.fnt`、`<name>.font-build.json`；SDF 额外保留
`<name>.sdf.json` 原始指标。FNT 使用整数坐标，半像素边界向外取整并补偿基线和偏移，
保留空格 advance、负偏移和 kerning。转换不支持旋转、多页、非对称距离场。

生成时在缓存内暂存、核对全部字符和边界后才写输出；最后写清单。`--check` 离线核对
字体源、规范化字符表、参数、生成实现指纹以及所有输出哈希。不会自动补字或隐式运行工具。
系统异常中断可能留下部分新文件，此时检查失败，重新生成即可。

## Cocos Creator 3.8

`font build` 不修改 `.meta`。显式执行 `font cocos` 才创建字体导入设置和共享材质，保留
已有 UUID；已有导入设置不合要求时报告错误，避免隐式改动人工设置。Creator 导入时会补齐
自己的资源数据库字段。源 `.ttf` 不需要放入运行 Bundle。

普通位图直接给 `Label.font` 赋值。SDF 可在同节点添加 `TexturePackerSdfLabel`，在 Inspector
指定生成的 FNT 和材质，也可在加载完成后调用：

```ts
// 字体与材质通过游戏自己的资源服务加载，组件不接管其加载引用。
const sdf = node.getComponent(SdfLabel);
node.getComponent(Label).string = '准备出发 0123';
sdf.setFont(font, sharedMaterial);
```

组件只在启用或资源更换时工作，禁用时恢复仍由自己持有的字体/材质。没有 `update`，
不逐字创建节点，不改引擎 assembler，不创建逐 Label 的 MaterialInstance。Label 自己管理
换行、对齐、顶点缓存、颜色、节点透明度和 UI 渲染顺序。

生成三种材质：

| 后缀 | 用途 |
| --- | --- |
| `-sdf.mtl` | 默认，单纹理采样，屏幕导数抗锯齿，适应字号和节点缩放 |
| `-sdf-outline.mtl` | 同一次纹理采样计算填充和描边，描边颜色与宽度由共享材质控制 |
| `-sdf-fallback.mtl` | 无导数，固定屏幕字号。默认平滑范围对应生成字号的 1:1 显示 |

`sdfParams.xy` 是图集宽高的倒数，`z` 是总距离范围；无导数材质的 `w` 为
`0.5 / (distanceRange * 屏幕显示像素与生成像素的比值)`。无导数方案改变字号、节点缩放或
Canvas 像素比例时，需要选择对应的共享材质。`outlineParams.x` 使用图集像素单位，
Shader 限制在 `distanceRange / 2 - 1` 以内。默认材质不要运行时反复改属性；相同样式复用
同一份资产。不同纹理、样式、Mask、层级穿插等仍可能打断合批，不保证任意页面只有一次 Draw Call。

动态创建大量 Label 时，先设置完整文本、字号、overflow 与 UITransform，再绑定字体。
提前绑定字体会先分配默认短文本，随后扩容容易让多个顶点缓冲交错，显著增加 Draw Call。
静态页面优先在 Prefab 配好最终属性；缓冲容量、其他 UI 的占用和创建顺序也会影响最终批次数。

纹理采用线性采样、clamp、无 mipmap、无裁剪、`packable=false`，关闭透明像素颜色修复；
不能进入精灵自动图集或有损压缩。SDF 保存的是线性距离，Shader 直接采样红通道，不做 sRGB
解码。单通道 PNG 不代表 Creator 实际上传为 R8，运行显存格式以引擎和设备为准。

距离场只改善缩放边缘，极小字号的细笔画仍需视觉验收；大缩放下单通道 SDF 的尖角会变圆。
较粗描边需要重建更大的 distanceRange。使用 CLAMP/SHRINK 时为描边和负字形偏移预留边距，
否则引擎会按 Label 区域裁切。玩家昵称等不可预知文本需另外的动态字体方案，不能假设子集包含所有汉字。

## 验证

`pnpm test` 包含字符规范化、边界转换、空格、kerning、缺字与配置检查。设置
`FONT_TEST_CONFIG` 后额外运行真实生成器的重复生成、产物篡改、缺字、容量不足和 Cocos 人工文件保护。
所有构建 TypeScript 目标为 ES2018，新增代码不使用后续语法和标准库。

消费项目应在 Creator 编译并实际显示普通、SDF、描边和无导数材质，再用
`installFontValidation` 在独立预览测试组件启停、200 Label/2000 字形共享材质、静态 renderData
身份与 Draw Call。该采样是桌面 CPU 提交和合批检查，不能当作微信设备 GPU 性能保证。
