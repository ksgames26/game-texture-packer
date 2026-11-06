import { _decorator, BitmapFont, Component, Font, Label, Material } from 'cc';

const { ccclass, property, requireComponent, disallowMultiple, executeInEditMode } = _decorator;

/** 只在启用或资源切换时绑定；文本排版、顶点缓存、颜色与合批沿用 Label。 */
@ccclass('TexturePackerSdfLabel')
@requireComponent(Label)
@disallowMultiple
@executeInEditMode
export class SdfLabel extends Component {
    @property({ type: BitmapFont, visible: false })
    private _sdfFont: BitmapFont | null = null;

    @property({ type: Material, visible: false })
    private _sdfMaterial: Material | null = null;

    @property({ type: BitmapFont, tooltip: '由 game-texture-packer 生成的 SDF FNT' })
    get sdfFont(): BitmapFont | null { return this._sdfFont; }
    set sdfFont(value: BitmapFont | null) {
        this._sdfFont = value;
        if (this._label) this.apply();
    }

    @property({ type: Material, tooltip: '复用生成的共享材质；同图集、同样式可参与 UI 合批' })
    get sdfMaterial(): Material | null { return this._sdfMaterial; }
    set sdfMaterial(value: Material | null) {
        this._sdfMaterial = value;
        if (this._label) this.apply();
    }

    private _label: Label | null = null;
    private _previousFont: Font | null = null;
    private _previousMaterial: Material | null = null;
    private _previousSystemFont = true;
    private _appliedFont: BitmapFont | null = null;
    private _appliedMaterial: Material | null = null;

    onEnable(): void {
        this._label = this.getComponent(Label);
        if (!this._label) return;
        this._previousFont = this._label.font;
        this._previousMaterial = this._label.customMaterial;
        this._previousSystemFont = this._label.useSystemFont;
        this.apply();
    }

    /** 加载资源后一次性设置，不创建材质实例，不写引擎内部字段。 */
    setFont(font: BitmapFont, material: Material): void {
        this._sdfFont = font;
        this._sdfMaterial = material;
        this.apply();
    }

    apply(): void {
        const label = this._label;
        const font = this._sdfFont;
        const material = this._sdfMaterial;
        if (!label || !this.enabledInHierarchy) return;
        if (!font || !material) {
            this.restore();
            return;
        }
        if (!font.spriteFrame || font.spriteFrame.packable) {
            throw new Error('SDF 字体必须关闭 SpriteFrame.packable，请运行 font cocos 同步导入设置');
        }
        if (material.effectName !== 'texture-packer-sdf' && !material.effectName.endsWith('/texture-packer-sdf')) {
            throw new Error('SDF 字体需要 texture-packer-sdf 材质');
        }
        const params = material.getProperty('sdfParams') as { x: number; y: number } | null;
        const texture = font.spriteFrame.texture;
        if (!params || Math.abs(params.x - 1 / texture.width) > 0.00000001 ||
            Math.abs(params.y - 1 / texture.height) > 0.00000001) {
            throw new Error('SDF 材质的图集尺寸与字体不一致，请使用该字体对应的材质');
        }
        label.font = font;
        label.useSystemFont = false;
        label.customMaterial = material;
        this._appliedFont = font;
        this._appliedMaterial = material;
    }

    onDisable(): void {
        this.restore();
        this._label = null;
        this._previousFont = null;
        this._previousMaterial = null;
    }

    private restore(): void {
        const label = this._label;
        if (!label) return;
        // 仅恢复本组件仍持有的属性，不覆盖外部后来设置的字体或材质。
        if (this._appliedFont && label.font === this._appliedFont) {
            label.font = this._previousFont;
            label.useSystemFont = this._previousSystemFont;
        }
        if (this._appliedMaterial && label.customMaterial === this._appliedMaterial) {
            label.customMaterial = this._previousMaterial;
        }
        this._appliedFont = null;
        this._appliedMaterial = null;
    }
}
