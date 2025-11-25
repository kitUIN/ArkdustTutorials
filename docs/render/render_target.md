# 渲染目标 [//TODO]

## 离屏渲染目标(`RenderTarget`)内容混合

游戏中的渲染并非全部在一个渲染目标(可以理解为画布)上完成的，许多特殊的渲染在离屏渲染目标上完成。
它们与主渲染目标之间相互独立，只在调用特定的代码后被绘制至主屏幕。

接下来，我们将以一个物品渲染类型为例，分析这一过程。如下，这是物品附魔发光的渲染类型

```java
public static final RenderType ENTITY_GLINT = create(
        "entity_glint",
        DefaultVertexFormat.POSITION_TEX,
        VertexFormat.Mode.QUADS,
        1536,
        RenderType.CompositeState.builder()
                .setShaderState(RENDERTYPE_ENTITY_GLINT_SHADER)
                .setTextureState(new RenderStateShard.TextureStateShard(ItemRenderer.ENCHANTED_GLINT_ENTITY, true, false))
                .setWriteMaskState(COLOR_WRITE)
                .setCullState(NO_CULL)
                .setDepthTestState(EQUAL_DEPTH_TEST)
                .setTransparencyState(GLINT_TRANSPARENCY)
                .setOutputState(ITEM_ENTITY_TARGET)         //SEE HERE
                .setTexturingState(ENTITY_GLINT_TEXTURING)
                .createCompositeState(false)
);

public static RenderType entityGlint() {
    return ENTITY_GLINT;
}
```

在这个渲染类型中，`setOutputState`一行代码指定的`ITEM_ENTITY_TARGET`：

```java
public static final RenderStateShard.OutputStateShard ITEM_ENTITY_TARGET = new RenderStateShard.OutputStateShard("item_entity_target", () -> {
    if (Minecraft.useShaderTransparency()) {
        Minecraft.getInstance().levelRenderer.getItemEntityTarget().bindWrite(false);
    }
}, () -> {
    if (Minecraft.useShaderTransparency()) {
        Minecraft.getInstance().getMainRenderTarget().bindWrite(false);
    }
});

//方便展示类构造方法 省去部分代码
public record RenderStateShard(String name, Runnable setupState, Runnable clearState) {
    public void setupRenderState() {
        this.setupState.run();
    }

    public void clearRenderState() {
        this.clearState.run();
    }
}
```

让我们解释一下这个`RenderStateShard`。这是一个渲染状态块，用于管理帧缓冲区的绑定与切换。也是渲染类型的父类。

其中`setupState`与`clearState`分别是在进入与退出该渲染状态下执行的内容。
根据代码，可以看到`ITEM_ENTITY_TARGET`在进入状态时将写入渲染目标设置为了物品渲染目标(`LevelRenderer#itemEntityTarget`)，
并在退出状态时重新将写入渲染目标设置回主渲染目标。

让我们继续看这些方法在哪里被调用：

```java
public void renderLevel() {//简化形参 这是游戏的主渲染代码，详情请看渲染流程那篇
    //......
    MultiBufferSource.BufferSource multibuffersource$buffersource = this.renderBuffers.bufferSource();
    multibuffersource$buffersource.endBatch(RenderType.entityGlint());
    //......
}

public class BufferSource implements MultiBufferSource {
    //......
    public void endBatch(RenderType renderType) {
        BufferBuilder bufferbuilder = this.startedBuilders.remove(renderType);
        if (bufferbuilder != null) {
            this.endBatch(renderType, bufferbuilder);
        }
    }

    private void endBatch(RenderType renderType, BufferBuilder builder) {
        MeshData meshdata = builder.build();
        if (meshdata != null) {
            if (renderType.sortOnUpload()) {
                ByteBufferBuilder bytebufferbuilder = this.fixedBuffers.getOrDefault(renderType, this.sharedBuffer);
                meshdata.sortQuads(bytebufferbuilder, RenderSystem.getVertexSorting());
            }
            renderType.draw(meshdata);
        }
        if (renderType.equals(this.lastSharedType)) {
            this.lastSharedType = null;
        }
    }
}

public class RenderType extends RenderStateShard {
    //......
    public void draw(MeshData meshData) {
        this.setupRenderState();
        BufferUploader.drawWithShader(meshData);
        this.clearRenderState();
    }
}
```

在渲染主程序中，顶点缓存存储器(`MultiBufferSource.BufferSource`)使用`endBatch`批量提交一个一种渲染类型有关的渲染任务。
这一过程中会创建一个存储数据网格(`MeshData`)，这一对象打包了之前添加的所有顶点信息(例如位置，光照，颜色，纹理坐标等)
，可以进行高效的数据处理。

将这一对象提交给渲染类型进行绘制，而渲染类型首先**将写入渲染目标设置为自身指向的离屏渲染目标**。
在这之后，根据当前渲染类型配置着色器与材质等，并创建gpu运算的计划，这一计划中将包含当前的写入渲染目标，在这里就是我们指定的物品渲染目标。

在这之后，清除渲染状态，重新**将写入渲染目标设置为主渲染目标**。

具体到代码中，存在大量的`multibuffersource$buffersource.endBatch`语句，将各类渲染类型存储的顶点信息一一提交，计算。

最终，所有顶点信息都将被渲染类型修饰后提交，并由gpu完成运算后，将带有深度等信息的光栅化图像存储在渲染对象中。

现在，我们获得了一系列相互独立的渲染对象。最后一步，将其按照一定顺序全部混合至主渲染目标。
这一步使用后处理效果链实现，即`LevelRenderer#transparencyChain`，其在天气渲染完成后被执行(疑似有点过耦了)：

```java
public void renderLevel(
        DeltaTracker deltaTracker, boolean renderBlockOutline, Camera camera, GameRenderer gameRenderer, LightTexture lightTexture, Matrix4f frustumMatrix, Matrix4f projectionMatrix
) {
    //......
    if (this.transparencyChain != null) {
        RenderStateShard.WEATHER_TARGET.setupRenderState();
        profilerfiller.popPush("weather");
        this.renderSnowAndRain(lightTexture, f, d0, d1, d2);
        dispatchRenderStage(RenderLevelStageEvent.Stage.AFTER_WEATHER, this, posestack, frustumMatrix, projectionMatrix, this.ticks, camera, frustum);
        this.renderWorldBorder(camera);
        RenderStateShard.WEATHER_TARGET.clearRenderState();
        this.transparencyChain.process(deltaTracker.getGameTimeDeltaTicks());       //SEE HERE
        this.minecraft.getMainRenderTarget().bindWrite(false);
    }
    //......
}
```

这个transparencyChain对应的是`shaders/post/transparency.json`，其处理链分两步：

- 先对已用到的渲染对象自动创建采样器，使用`shaders/program/transparency.json`着色器程序进行处理，
  将混合结果存储在`final`渲染对象中。
- 再使用`shaders/program/blit.json`着色器程序直接将`final`渲染对象上的结果转移至`minecraft:main`即主渲染目标。

这一过程将 水 半透明物 物品实体 粒子 云 天气效果 这些效果从主渲染目标中拆出，以更好的解决半透明分层问题。


