export interface FontGlyph {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
}

interface Bounds { left: number; bottom: number; right: number; top: number }
export interface SdfAtlas {
  atlas: { type: string; width: number; height: number; size: number; distanceRange: number; distanceRangeMiddle?: number; yOrigin: string };
  metrics: { ascender: number; lineHeight: number };
  glyphs: { unicode: number; advance: number; planeBounds?: Bounds; atlasBounds?: Bounds }[];
  kerning: { unicode1: number; unicode2: number; advance: number }[];
}

/** 将向上为正的 em 坐标转成 Creator 支持的整数 BMFont 指标。 */
export function sdfToBmfont(source: SdfAtlas, name: string): string {
  const atlas = source.atlas;
  if (atlas.type !== "sdf" || atlas.yOrigin !== "bottom" || (atlas.distanceRangeMiddle || 0) !== 0) {
    throw new Error("仅支持对称单通道 SDF 与 bottom 坐标系");
  }
  if (![atlas.size, atlas.width, atlas.height, atlas.distanceRange, source.metrics.lineHeight].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error("SDF 图集指标无效");
  }
  const size = atlas.size;
  const base = Math.ceil(source.metrics.ascender * size);
  const glyphs: FontGlyph[] = source.glyphs.map(glyph => {
    const a = glyph.atlasBounds;
    const p = glyph.planeBounds;
    if (Boolean(a) !== Boolean(p)) throw new Error(`字形边界不完整：${glyph.unicode}`);
    const result = { id: glyph.unicode, x: 0, y: 0, width: 0, height: 0, xoffset: 0, yoffset: 0, xadvance: Math.round(glyph.advance * size) };
    if (a && p) {
      // 上游边界可能落在半像素，向外取整同时补偿平面边界，不能直接截断。
      result.x = Math.floor(a.left);
      result.y = atlas.height - Math.ceil(a.top);
      result.width = Math.ceil(a.right) - result.x;
      result.height = Math.ceil(a.top) - Math.floor(a.bottom);
      result.xoffset = Math.round(p.left * size - (a.left - result.x));
      result.yoffset = Math.round(base - p.top * size - (Math.ceil(a.top) - a.top));
    }
    return result;
  });
  glyphs.sort((a, b) => a.id - b.id);
  const kernings = source.kerning.map(pair => ({ first: pair.unicode1, second: pair.unicode2, amount: Math.round(pair.advance * size) }))
    .filter(pair => pair.amount !== 0).sort((a, b) => a.first - b.first || a.second - b.second);
  return [
    `info face="${name}" size=${Math.round(size)} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=0,0 outline=0`,
    `common lineHeight=${Math.ceil(source.metrics.lineHeight * size)} base=${base} scaleW=${atlas.width} scaleH=${atlas.height} pages=1 packed=0`,
    `page id=0 file="${name}.png"`,
    `chars count=${glyphs.length}`,
    ...glyphs.map(glyph => "char " + Object.entries(glyph).map(([key, value]) => `${key}=${value}`).join(" ") + " page=0 chnl=4"),
    `kernings count=${kernings.length}`,
    ...kernings.map(pair => `kerning first=${pair.first} second=${pair.second} amount=${pair.amount}`),
    "",
  ].join("\n");
}

/** 输出必须包含所有请求字形且限制为单张、无旋转图集。 */
export function validateBmfont(text: string, charset: string, name: string, maximumSize: number): void {
  const common = /^common\s+(.+)$/m.exec(text);
  const page = /^page id=0 file="([^"]+)"/m.exec(text);
  if (!common || !page || page[1] !== `${name}.png` || !/\bpages=1\b/.test(common[1]!)) {
    throw new Error("字体输出必须为单页 FNT 与同名 PNG");
  }
  const metrics = parseIntegers(common[1]!);
  const width = metrics.scaleW!;
  const height = metrics.scaleH!;
  if (![width, height, metrics.lineHeight, metrics.base].every(value => Number.isSafeInteger(value))) {
    throw new Error("字体公共指标缺失或无效");
  }
  if (width > maximumSize || height > maximumSize || width < 1 || height < 1) throw new Error("字体纹理尺寸越界");
  const seen = new Set<number>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("char ")) continue;
    const values = parseIntegers(line);
    const required = ["id", "x", "y", "width", "height", "xoffset", "yoffset", "xadvance", "page"];
    if (!required.every(key => Number.isSafeInteger(values[key]))) throw new Error(`字形指标缺失或无效：${line}`);
    const id = values.id!;
    if (seen.has(id)) throw new Error(`重复字形：${id}`);
    seen.add(id);
    if (values.page !== 0 || values.x! < 0 || values.y! < 0 || values.width! < 0 || values.height! < 0 ||
        values.x! + values.width! > width || values.y! + values.height! > height) throw new Error(`字形边界越界：${id}`);
  }
  const missing = Array.from(charset).filter(char => !seen.has(char.charCodeAt(0)));
  if (missing.length) throw new Error(`字体缺少 ${missing.length} 个字符：${missing.slice(0, 24).map(char => `${char}(U+${char.charCodeAt(0).toString(16)})`).join(" ")}`);
}

function parseIntegers(line: string): Record<string, number> {
  const values: Record<string, number> = {};
  const expression = /\b(\w+)=(-?\d+)(?=\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(line)) !== null) values[match[1]!] = Number(match[2]);
  return values;
}
