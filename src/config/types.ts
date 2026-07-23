export type OneOrMany<T> = T | T[];

export interface InputOptions {
  files: OneOrMany<string>;
  ignore?: OneOrMany<string>;
  cwd?: string;
  allowEmpty?: boolean;
  followSymbolicLinks?: boolean;
  caseSensitiveMatch?: boolean;
}

export interface OutputOptions {
  directory: string;
  overwrite?: boolean;
  manifest?: boolean | string;
}

export interface CustomExporter {
  fileExt: string;
  template?: string;
  content?: string;
}

export interface AppInfo {
  url: string;
  version: string;
  displayName?: string;
}

export interface PackerOptions {
  textureName?: string;
  suffix?: string;
  suffixInitialValue?: number;
  width?: number;
  height?: number;
  fixedSize?: boolean;
  powerOfTwo?: boolean;
  padding?: number;
  extrude?: number;
  allowRotation?: boolean;
  detectIdentical?: boolean;
  allowTrim?: boolean;
  trimMode?: "trim" | "crop";
  alphaThreshold?: number;
  removeFileExtension?: boolean;
  prependFolderName?: boolean;
  textureFormat?: "png" | "jpg" | "webp";
  base64Export?: boolean;
  scale?: number;
  scaleMethod?: "BILINEAR" | "NEAREST_NEIGHBOR" | "BICUBIC" | "HERMITE" | "BEZIER";
  tinify?: boolean;
  tinifyKey?: string;
  tinifyKeyEnv?: string;
  packer?: "MaxRectsBin" | "MaxRectsPacker" | "OptimalPacker";
  packerMethod?:
    | "BestShortSideFit"
    | "BestLongSideFit"
    | "BestAreaFit"
    | "BottomLeftRule"
    | "ContactPointRule"
    | "Smart"
    | "Square"
    | "SmartSquare"
    | "SmartArea"
    | "SquareArea"
    | "SmartSquareArea";
  exporter?:
    | "JsonHash"
    | "JsonArray"
    | "Css"
    | "OldCss"
    | "Pixi"
    | "GodotAtlas"
    | "GodotTileset"
    | "PhaserHash"
    | "PhaserArray"
    | "Phaser3"
    | "XML"
    | "Starling"
    | "Cocos2d"
    | "Spine"
    | "Unreal"
    | "UIKit"
    | "Unity3D"
    | "Egret2D"
    | CustomExporter;
  filter?: "grayscale" | "mask" | "none";
  appInfo?: AppInfo;
}

export interface JobDefaults {
  input?: Partial<InputOptions>;
  output?: Partial<OutputOptions>;
  packer?: PackerOptions;
}

export interface TexturePackerJob {
  name: string;
  enabled?: boolean;
  input: InputOptions;
  output: OutputOptions;
  packer?: PackerOptions;
}

export interface TexturePackerConfig {
  $schema?: string;
  cwd?: string;
  concurrency?: number;
  failFast?: boolean;
  defaults?: JobDefaults;
  jobs: TexturePackerJob[];
}

export function defineConfig(config: TexturePackerConfig): TexturePackerConfig {
  return config;
}
