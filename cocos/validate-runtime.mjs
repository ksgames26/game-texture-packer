/** 在独立 Creator 浏览器预览运行；仅创建诊断场景，不修改作者场景。 */
export async function installFontValidation(config) {
    const cc = await System.import('cc');
    const load = uuid => new Promise((accept, reject) => cc.assetManager.loadAny({ uuid }, (error, asset) => error ? reject(error) : accept(asset)));
    const [bitmap, sdf, material, outline, fallback] = await Promise.all([
        config.bitmap, config.sdf, config.material, config.outline, config.fallback,
    ].map(load));
    const Helper = cc.js.getClassByName('TexturePackerSdfLabel');
    if (!Helper) throw new Error('TexturePackerSdfLabel 尚未编译');
    cc.profiler.hideStats();
    cc.view.setDesignResolutionSize(1200, 900, cc.ResolutionPolicy.SHOW_ALL);
    const scene = new cc.Scene('FontValidation');
    const canvasNode = new cc.Node('Canvas');
    canvasNode.layer = cc.Layers.Enum.UI_2D;
    scene.addChild(canvasNode);
    canvasNode.addComponent(cc.UITransform).setContentSize(1200, 900);
    const canvas = canvasNode.addComponent(cc.Canvas);
    const cameraNode = new cc.Node('Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(600, 450, 1000);
    const camera = cameraNode.addComponent(cc.Camera);
    camera.projection = cc.Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 450;
    camera.near = 1;
    camera.far = 2000;
    camera.visibility = cc.Layers.Enum.UI_2D;
    camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new cc.Color(24, 30, 44, 255);
    canvas.cameraComponent = camera;
    cc.director.runSceneImmediate(scene);

    function group(name) {
        const node = new cc.Node(name);
        node.layer = cc.Layers.Enum.UI_2D;
        canvasNode.addChild(node);
        return node;
    }
    const overview = group('Overview');
    const stress = group('Stress');
    stress.active = false;
    function label(parent, text, font, mat, size, x, y, width = 540, height = 150) {
        const node = new cc.Node('Text');
        node.layer = cc.Layers.Enum.UI_2D;
        parent.addChild(node);
        node.setPosition(x, y);
        const transform = node.addComponent(cc.UITransform);
        transform.setAnchorPoint(0, 1);
        transform.setContentSize(width, height);
        const component = node.addComponent(cc.Label);
        component.fontSize = size;
        component.lineHeight = Math.ceil(size * 1.25);
        component.string = text;
        component.overflow = cc.Label.Overflow.CLAMP;
        component.enableWrapText = true;
        component.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
        component.verticalAlign = cc.Label.VerticalAlign.TOP;
        component.color = new cc.Color(242, 239, 220, 255);
        // Label 的初始化会调整 UITransform，固定验收区域须在属性绑定后设置。
        transform.setContentSize(width, height);
        // 先设置完整文本与排版，再赋字体，避免默认短文本分配后立即扩容导致顶点缓冲碎片。
        component.font = font;
        if (mat) node.addComponent(Helper).setFont(font, mat);
        transform.setContentSize(width, height);
        return component;
    }
    label(overview, 'BITMAP 48px', bitmap, null, 26, -550, 410);
    label(overview, 'SDF 48px', sdf, material, 26, 40, 410);
    for (const [size, y] of [[24, 340], [48, 250], [96, 100]]) {
        const text = size === 96 ? '赛车 Ag中!\n012345' : '赛车 Ag中!\n0123456789';
        label(overview, text, bitmap, null, size, -550, y, 540, size === 96 ? 250 : 150);
        label(overview, text, sdf, material, size, 40, y, 540, size === 96 ? 250 : 150);
    }
    label(overview, 'SDF OUTLINE\n漂移 · 准备出发', sdf, outline, 40, -550, -150);
    label(overview, 'SDF FALLBACK\n漂移 · 准备出发', sdf, fallback, 48, 40, -150);
    label(overview, '中文换行：每一圈，都是新的开始。', sdf, material, 28, -550, -310, 1000, 90);

    // 在真实引擎中验证启停与空资源恢复，防止把距离图交给普通材质。
    const lifecycle = label(stress, 'A', bitmap, null, 18, 0, 0);
    const helper = lifecycle.node.addComponent(Helper);
    helper.setFont(sdf, material);
    stress.active = true;
    if (lifecycle.font !== sdf || lifecycle.customMaterial !== material) throw new Error('SDF 绑定失败');
    helper.enabled = false;
    if (lifecycle.font !== bitmap || lifecycle.customMaterial !== null) throw new Error('SDF 禁用未恢复');
    helper.enabled = true;
    helper.sdfMaterial = null;
    if (lifecycle.font !== bitmap || lifecycle.customMaterial !== null) throw new Error('SDF 空资源未恢复');
    lifecycle.node.destroy();
    stress.active = false;

    const labels = [];
    for (let index = 0; index < 200; index++) {
        const item = label(stress, '0123456789', sdf, material, 16,
            -550 + (index % 10) * 112, 410 - Math.floor(index / 10) * 40, 112, 32);
        item.enableWrapText = false;
        labels.push(item);
    }
    const afterDraw = () => new Promise(resolve => cc.director.once(cc.Director.EVENT_AFTER_DRAW, resolve));
    async function waitFrames(count) { for (let i = 0; i < count; i++) await afterDraw(); }
    await waitFrames(6);
    globalThis.__fontValidation = {
        async measure() {
            overview.active = false;
            stress.active = true;
            await waitFrames(10);
            const renders = labels.map(item => item.renderData);
            const times = [];
            const draws = [];
            let begin = 0;
            const before = () => { begin = performance.now(); };
            cc.director.on(cc.Director.EVENT_BEFORE_DRAW, before);
            try {
                for (let frame = 0; frame < 60; frame++) {
                    await afterDraw();
                    times.push(performance.now() - begin);
                    draws.push(cc.director.root.device.numDrawCalls);
                }
            } finally {
                cc.director.off(cc.Director.EVENT_BEFORE_DRAW, before);
            }
            const sorted = times.slice().sort((a, b) => a - b);
            const result = {
                engine: cc.ENGINE_VERSION, gfxAPI: cc.director.root.device.gfxAPI,
                labelCount: labels.length, glyphCount: labels.length * 10, frames: times.length,
                drawCalls: { min: Math.min(...draws), max: Math.max(...draws) },
                renderCpuMs: { mean: times.reduce((sum, value) => sum + value, 0) / times.length, p95: sorted[Math.floor(sorted.length * 0.95)] },
                sharedMaterials: new Set(labels.map(item => item.getSharedMaterial(0))).size,
                renderMaterials: new Set(labels.map(item => item.getRenderMaterial(0))).size,
                renderDataMaterials: new Set(labels.map(item => item.renderData.material)).size,
                renderDataHashes: new Set(labels.map(item => item.renderData.dataHash)).size,
                bufferIds: Array.from(new Set(labels.map(item => item.renderData.chunk.bufferId))),
                completeGlyphs: labels.every(item => item.renderData.vertexCount === 40),
                stableRenderData: labels.every((item, index) => item.renderData === renders[index]),
                lifecyclePassed: true,
            };
            if (result.sharedMaterials !== 1 || result.renderMaterials !== 1 || !result.stableRenderData ||
                !result.completeGlyphs || result.drawCalls.max > result.bufferIds.length || result.drawCalls.min < 1) {
                throw new Error('SDF 合批/缓存检查失败：' + JSON.stringify(result));
            }
            overview.active = true;
            stress.active = false;
            await waitFrames(3);
            return result;
        },
    };
    return { ready: true };
}
