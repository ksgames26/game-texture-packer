import { describe, expect, it } from "vitest";
import { normalizeCharset, fontConfigSchema } from "../../src/fonts/config.js";
import { sdfToBmfont, validateBmfont, type SdfAtlas } from "../../src/fonts/bmfont.js";

function atlas(): SdfAtlas {
  return {
    atlas: { type: "sdf", width: 64, height: 64, size: 48, distanceRange: 8, yOrigin: "bottom" },
    metrics: { ascender: 0.8798828125, lineHeight: 1 },
    glyphs: [
      { unicode: 32, advance: 0.25 },
      { unicode: 65, advance: 0.75,
        planeBounds: { left: -0.5 / 48, bottom: -6.5 / 48, right: 33.5 / 48, top: 39.5 / 48 },
        atlasBounds: { left: 2.5, bottom: 10.5, right: 36.5, top: 56.5 } },
    ],
    kerning: [{ unicode1: 65, unicode2: 65, advance: -0.02 }],
  };
}

describe("字体字符表与 BMFont 转换", () => {
  it("去掉排版控制符，稳定去重，保留空格", () => {
    expect(normalizeCharset("\ufeff中A\r\nA\t 文")).toBe(" A中文");
    expect(() => normalizeCharset("\n\t")).toThrow(/为空/);
    expect(() => normalizeCharset("😀")).toThrow(/BMP/);
    expect(() => normalizeCharset("\ud800")).toThrow(/BMP/);
  });

  it("严格拒绝拼错参数与重复任务名", () => {
    const job = { name: "font", mode: "sdf", font: "font.ttf", charsetFiles: ["chars.txt"], output: "out" };
    expect(() => fontConfigSchema.parse({ jobs: [{ ...job, fontsize: 12 }] })).toThrow();
    expect(() => fontConfigSchema.parse({ jobs: [job, job] })).toThrow(/重名/);
  });

  it("半像素边界向外取整，并同步补偿基线和左侧间距", () => {
    const text = sdfToBmfont(atlas(), "test");
    expect(text).toContain("char id=65 x=2 y=7 width=35 height=47 xoffset=-1 yoffset=3 xadvance=36 page=0 chnl=4");
    expect(text).toContain("char id=32 x=0 y=0 width=0 height=0 xoffset=0 yoffset=0 xadvance=12");
    expect(text).toContain("kerning first=65 second=65 amount=-1");
    expect(() => validateBmfont(text, " A", "test", 64)).not.toThrow();
  });

  it("拒绝缺字、页数或边界不匹配，避免成功生成错误字体", () => {
    const text = sdfToBmfont(atlas(), "test");
    expect(() => validateBmfont(text, "AB", "test", 64)).toThrow(/缺少/);
    expect(() => validateBmfont(text.replace("pages=1", "pages=2"), "A", "test", 64)).toThrow(/单页/);
    expect(() => validateBmfont(text.replace("width=35", "width=65"), "A", "test", 64)).toThrow(/越界/);
    expect(() => validateBmfont(text.replace("scaleW=64", "scaleW=NaN"), "A", "test", 64)).toThrow(/指标/);
    expect(() => validateBmfont(text.replace("xadvance=36", "xadvance=NaN"), "A", "test", 64)).toThrow(/指标/);
    expect(() => validateBmfont(text.replace("xadvance=36", "xadvance=3.5"), "A", "test", 64)).toThrow(/指标/);
    expect(() => validateBmfont(text + text.split("\n").find(line => line.startsWith("char id=65")), "A", "test", 64)).toThrow(/重复/);
  });

  it("拒绝非对称距离场和错误坐标方向", () => {
    const value = atlas();
    value.atlas.yOrigin = "top";
    expect(() => sdfToBmfont(value, "test")).toThrow(/bottom/);
    value.atlas.yOrigin = "bottom";
    value.atlas.distanceRangeMiddle = 2;
    expect(() => sdfToBmfont(value, "test")).toThrow(/对称/);
  });
});
