---
writers:
  - MonLandis
versions:
  id: "game_render_process"
  vanilla: "1.21.1"
  loaders:
    - text: "Neoforge 21.1.213"
      loader: "neoforge"  
---

# 游戏全渲染流程(仅阅读)

渲染流程全部在客户端完成，其从`Minecraft#runTick`方法内开始。

## Minecraft#runTick

此处的tick指的是`FrameTick`，即每次调用该方法将渲染一帧游戏画面。

这一方法的逻辑顺序是，首先执行预渲染处理：

- 当游戏窗口被请求关闭，进入终止流程。
- 如果有重载资源包任务且未处于加载状态，进入资源包重载，完成后反馈完成。
- 执行任务队列`progressTasks`内其它额外任务。
- 更新计时器后，若渲染维度：
    - 执行所有计划的可执行任务。
    - 执行客户端逻辑更新，即`ClientTick`。计时器将返回经过的游戏刻，取其与10(即0.5s)的较小值作为循环次数。

在客户端逻辑更新中，处理的主要是一些非数据逻辑层面的，对实际客户端时间精度要求较高的功能，
例如聊天消息延迟，动画材质状态切换，处理键盘输入，处理声音系统以及为其它渲染器提供tick服务。

这也被称为客户端游戏逻辑心跳。可分别通过`ClientTickEvent.Pre`与`ClientTickEvent.Post`事件添加客户端tick前后的逻辑。

> 在此需要提及一下客户端刻(`ClientTick`)与帧刻(`FrameTick`)之间的关联。
>
> `ClientTick`是近似每50ms执行一次的，主要负责客户端方面的游戏逻辑；
> `FrmaeTick`则是和渲染强相关的，表现为游戏的帧率。
>
> `Minecraft#runTick`方法中的tick指的是`FrameTick`，但是`ClientTick`的逻辑和这个方法耦合：
> ```java
> private void runTick(boolean renderLevel) {
>   //......
>   int deltaClientTick = this.timer.advanceTime(Util.getMillis(), renderLevel);
>   if (renderLevel) {
>       //执行计划内容
>       this.profiler.push("scheduledExecutables");
>       this.runAllTasks();
>       this.profiler.pop();
>       //执行ClientTick
>       this.profiler.push("tick");
>       //根据计时器解算出一次性需要执行的客户端tick次数，最低为0，最高为10。
>       for (int j = 0; j < Math.min(10, deltaClientTick); j++) {
>           this.profiler.incrementCounter("clientTick");
>           this.tick();
>       }
>       this.profiler.pop();
>   }
>   //......
> }
> ```
> 在该方法内，这段代码每`FrameTick`被触发，通过计时器来计算经过的`ClientTick`(即`deltaClientTick`)，并基于此执行客户端刻。
> 由于帧率与可能不会为20的倍数，`ClientTick`也很可能不会为精确的50ms/tick。
>
> 原则上这部分代码应该被拆解，但bugjump确实没这么干。不知道为什么。

然后执行渲染的主内容。

- 首先是声音系统，根据当前摄像头位置调整音效特性。
- 如果处于debug状态(F3)或是性能分析，可能需要初始化性能分析器。
- 进入渲染核心部分：
  ```java
  private void runTick(boolean renderLevel) {
    //......
    RenderSystem.clear(16640, ON_OSX);//清除帧缓冲区内容。16640为GL_COLOR_BUFFER_BIT和 GL_DEPTH_BUFFER_BIT的组合，即颜色与深度。
    this.mainRenderTarget.bindWrite(true);//绑定游戏窗口为渲染对象
    FogRenderer.setupNoFog();//关闭雾效果以避免游戏ui，贴图等内容被雾气遮挡
    //启用面剔除降低性能负担
    this.profiler.push("display");
    RenderSystem.enableCull();
    //处理鼠标的位移量
    this.profiler.popPush("mouse");
    this.mouseHandler.handleAccumulatedMovement();
    this.profiler.pop();
    //如果启用渲染，进入游戏核心内容渲染部分
    if (!this.noRender) {
        //这里预留了RenderFrameEvent.Pre与RenderFrameEvent.Post两个方法，可以在主内容渲染前后添加渲染内容。
      ClientHooks.fireRenderFramePre(this.timer);
      this.profiler.popPush("gameRenderer");
      this.gameRenderer.render(this.timer, renderLevel);
      this.profiler.pop();
      ClientHooks.fireRenderFramePost(this.timer);
    }
  
    //如果有fps饼状图分析结果，创建一个GuiGraphics写入结果，并将内容推送至主渲染对象
    if (this.fpsPieResults != null) {
      this.profiler.push("fpsPie");
      GuiGraphics guigraphics = new GuiGraphics(this, this.renderBuffers.bufferSource());
      this.renderFpsMeter(guigraphics, this.fpsPieResults);
      guigraphics.flush();//flush方法为关闭深度测试->推送内容->恢复开启深度测试，用以保证内容渲染在最上方
      this.profiler.pop();
    }
  
    this.profiler.push("blit");
    this.mainRenderTarget.unbindWrite();//解绑帧缓冲区写入状态
    //将帧渲染内容推送至主屏幕，准备将内容展示给玩家
    this.mainRenderTarget.blitToScreen(this.window.getWidth(), this.window.getHeight());
    this.frameTimeNs = Util.getNanos() - i1;
    if (flag) {//如果处于性能分析状态，结束分析采样
      TimerQuery.getInstance().ifPresent(p_231363_ -> this.currentFrameProfile = p_231363_.endProfile());
    }
  
    this.profiler.popPush("updateDisplay");
    this.window.updateDisplay();//推送渲染内容，将缓存区存储的渲染内容展示在窗口中。
    //进行最大帧率限制判定处理
    int j1 = this.getFramerateLimit();
    if (j1 < 260) {
      RenderSystem.limitDisplayFPS(j1);
    }
  
    //线程让步，表示该线程重要内容已完成，可以将cpu的时间片分发给其它线程以提高性能。
    this.profiler.popPush("yield");
    Thread.yield();
    this.profiler.pop();
    //......
  }
  ```

这部分最核心的代码是`this.gameRenderer.render(this.timer, renderLevel)`，负责游戏主要内容的渲染，我们会在下面详细分析。

最后是渲染后处理。这部分主要是更新游戏的暂停状态，更新计时器信息，以及向debug页面显示分析数据等。

## GameRenderer#render(DeltaTracker deltaTracker, boolean renderLevel)

此方法最开始处理了窗口聚焦与游戏暂停的。当然，我也不觉得这部分代码应该放在这里。

如果启用了渲染，那么接下来执行的内容是：

- 初始化渲染区域像素大小
- 完成维度场景渲染，发光生物边缘渲染，附加屏幕特效后处理(模糊等，这东西有点意思，后面写着色器部分讲讲)
- 初始化gui渲染状态设置：
  ```java
  public void render(DeltaTracker deltaTracker, boolean renderLevel) {
    //......
    RenderSystem.clear(256, Minecraft.ON_OSX);//清除深度缓存，防止gui渲染被遮挡
    Matrix4f matrix4f = new Matrix4f()
      .setOrtho(
        //左右下上为窗口渲染范围
        0.0F,
        (float)((double)window.getWidth() / window.getGuiScale()),
        (float)((double)window.getHeight() / window.getGuiScale()),
        0.0F,
        //远近剪裁范围
        1000.0F,
        net.neoforged.neoforge.client.ClientHooks.getGuiFarPlane()
      );
    //将创建好的正交投影矩阵设置为当前生效的投影矩阵
    RenderSystem.setProjectionMatrix(matrix4f, VertexSorting.ORTHOGRAPHIC_Z);
    //......
  }
  ```
- 进入gui渲染部分。如果有反胃效果，附加扭曲效果；如果展示hud，渲染手持物品模型与动画；渲染gui；最后清除深度缓存。
- 进入覆盖层渲染部分。渲染覆盖层，渲染gui屏幕
- 渲染小组件，例如存储标志，土司信息等。
- 推送`GuiGraphic`渲染内容，应用渲染矩阵。

## GameRenderer#renderLevel(DeltaTracker deltaTracker)

- 更新光照信息，更新镜头的绑定实体。
- 附加视角调整，将实体受击与实体移动的视角晃动效果附加至摄像机上，并将反胃效果的屏幕扭动附加。
- 预处理视锥角范围，裁切视野外渲染内容以提高性能。
- 调用`LevelRenderer#renderLevel`正式渲染维度场景。在这之后，广播`RenderLevelStageEvent`事件`AFTER_LEVEL`阶段。
- 若允许渲染手部，清除深度缓存，在最上层渲染手部内容。

## LevelRenderer#renderLevel(DeltaTracker, boolean renderBlockOutline, Camera, GameRenderer, LightTexture, Matrix4f frustumMatrix, Matrix4f projectionMatrix)

### 前期数据准备

首先是前期准备阶段，主要负责同步信息状态与为渲染做准备。

- 初始化渲染方块实体与生物实体的渲染调度器，根据传入的视角指向为后续渲染方块实体与生物实体做准备，以处理方块选中描边，实体准星等功能。
- 更新光照系统。检查周期内可能的光照变动队列，然后统一计算光照更新。
- 通过视锥体剔除可见范围外的场景，即`Frustum`这部分以提高性能。

### 世界场景Terrain渲染

接下来是开始从最远处渲染世界的非透明场景：

```java
public void renderLevel(
        DeltaTracker deltaTracker, boolean renderBlockOutline, Camera camera, GameRenderer gameRenderer, LightTexture lightTexture, Matrix4f frustumMatrix, Matrix4f projectionMatrix
) {
    //......
    //初始化内容渲染 清空颜色缓存与深度缓存
    profilerfiller.popPush("clear");
    FogRenderer.setupColor(camera, f, this.minecraft.level, this.minecraft.options.getEffectiveRenderDistance(), gameRenderer.getDarkenWorldAmount(f));
    FogRenderer.levelFogColor();
    RenderSystem.clear(16640, Minecraft.ON_OSX);
    //初始化常规雾气效果
    float f1 = gameRenderer.getRenderDistance();
    boolean flag1 = this.minecraft.level.effects().isFoggyAt(Mth.floor(d0), Mth.floor(d1)) || this.minecraft.gui.getBossOverlay().shouldCreateWorldFog();
    FogRenderer.setupFog(camera, FogRenderer.FogMode.FOG_SKY, f1, flag1, f);
    //渲染天空盒
    profilerfiller.popPush("sky");
    RenderSystem.setShader(GameRenderer::getPositionShader);
    this.renderSky(frustumMatrix, projectionMatrix, f, camera, flag1, () -> FogRenderer.setupFog(camera, FogRenderer.FogMode.FOG_SKY, f1, flag1, f));
    ClientHooks.dispatchRenderStage(RenderLevelStageEvent.Stage.AFTER_SKY, this, null, frustumMatrix, projectionMatrix, this.ticks, camera, frustum);
    //渲染雾气效果
    profilerfiller.popPush("fog");
    //这里面处理了相机位于不同液体中，玩家处于不同状态下的雾气始末距离。
    //最终结果通过ViewportEvent.RenderFog广播，若事件中渲染信息被修改则需要取消事件，表明需要再次配置新的雾气数值。
    FogRenderer.setupFog(camera, FogRenderer.FogMode.FOG_TERRAIN, Math.max(f1, 32.0F), flag1, f);
    //初始化地形渲染
    profilerfiller.popPush("terrain_setup");
    //这里通过检查摄像机区块位置以及最大渲染距离来判定可见区块范围，并根据视锥角范围确定真正需要执行渲染的区块。
    //这部分就会决定视野内可见的区块切片，这部分内容会被在下方的编译区块切片部分被用到
    this.setupRender(camera, frustum, flag, this.minecraft.player.isSpectator());
    //编译调度区块烘培
    profilerfiller.popPush("compile_sections");
    //在这个方法中，若可见范围内区块已被更改(标记为dirty)且光照重建完成，则会根据距离重新烘培区块模型。
    //具体而言，较近距离的区块会同步立刻重建以保证玩家交互的即时反馈，而较远的区块则会加入异步重建队列并提交计划。
    //这部分我们还会专门写一篇 区块模型构建与缓存系统
    this.compileSections(camera);
    //渲染地形
    profilerfiller.popPush("terrain");
    this.renderSectionLayer(RenderType.solid(), d0, d1, d2, frustumMatrix, projectionMatrix);//首先渲染大部分固体方块
    //暂时修改纹理设置以解决叶子与部分特殊材质的渲染问题，即cutoutMipped类型材质。用于修复树叶错误配置的问题。
    this.minecraft.getModelManager().getAtlas(TextureAtlas.LOCATION_BLOCKS).setBlurMipmap(false, this.minecraft.options.mipmapLevels().get() > 0);
    this.renderSectionLayer(RenderType.cutoutMipped(), d0, d1, d2, frustumMatrix, projectionMatrix);
    //恢复纹理设置，渲染cutout类型材质。
    this.minecraft.getModelManager().getAtlas(TextureAtlas.LOCATION_BLOCKS).restoreLastBlurMipmap();
    this.renderSectionLayer(RenderType.cutout(), d0, d1, d2, frustumMatrix, projectionMatrix);
    //最后根据维度特征设置光照效果
    if (this.level.effects().constantAmbientLight()) {
        Lighting.setupNetherLevel();
    } else {
        Lighting.setupLevel();
    }
    //......
}
```

### 实体Entity渲染

然后渲染生物实体：

```java
public void renderLevel(
        DeltaTracker deltaTracker, boolean renderBlockOutline, Camera camera, GameRenderer gameRenderer, LightTexture lightTexture, Matrix4f frustumMatrix, Matrix4f projectionMatrix
) {
    //......
    profilerfiller.popPush("entities");
    //初始化实体渲染计数器
    this.renderedEntities = 0;
    this.culledEntities = 0;
    //这里的itemEntityTarget weatherTarget entityTarget是三个离屏渲染对象，可以理解为三个单独的空白画布层
    //它们将在之后与主渲染对象混合，从而呈现出游戏中的效果
    //三个渲染对象分别是 物品实体渲染层 天气渲染层 边缘发光实体渲染层
    //这部分代码是在它们存在的情况下清空内容并进行初始化操作
    if (this.itemEntityTarget != null) {
        this.itemEntityTarget.clear(Minecraft.ON_OSX);
        this.itemEntityTarget.copyDepthFrom(this.minecraft.getMainRenderTarget());//这里复制主渲染层的深度信息以保证正确的遮挡关系
        this.minecraft.getMainRenderTarget().bindWrite(false);
    }
    if (this.weatherTarget != null) {
        this.weatherTarget.clear(Minecraft.ON_OSX);
    }
    if (this.shouldShowEntityOutlines()) {
        this.entityTarget.clear(Minecraft.ON_OSX);
        this.minecraft.getMainRenderTarget().bindWrite(false);
    }

    //初始化渲染坐标系
    Matrix4fStack matrix4fstack = RenderSystem.getModelViewStack();
    matrix4fstack.pushMatrix();
    matrix4fstack.mul(frustumMatrix);
    RenderSystem.applyModelViewMatrix();
    boolean flag2 = false;
    PoseStack posestack = new PoseStack();
    //创建顶点缓冲存储器。这一工具可以管理每种渲染类型提交的顶点数据并批量提交任务从而提高效率
    MultiBufferSource.BufferSource multibuffersource$buffersource = this.renderBuffers.bufferSource();

    //遍历所有需要渲染的实体
    for (Entity entity : this.level.entitiesForRendering()) {
        //如果实体未被裁切或是玩家的坐骑，进入渲染部分
        if (this.entityRenderDispatcher.shouldRender(entity, frustum, d0, d1, d2) || entity.hasIndirectPassenger(this.minecraft.player)) {
            BlockPos blockpos = entity.blockPosition();
            if ((this.level.isOutsideBuildHeight(blockpos.getY()) || this.isSectionCompiled(blockpos)) &&   //如果方块处于超界或位置上的区块构建已完成
                    (entity != camera.getEntity() || camera.isDetached() || camera.getEntity() instanceof LivingEntity && ((LivingEntity) camera.getEntity()).isSleeping()) && //如果摄像机分离或绑定的实体正在睡觉
                    (!(entity instanceof LocalPlayer) || camera.getEntity() == entity || (entity == minecraft.player && !minecraft.player.isSpectator()))) { //实体不是玩家，摄像机绑定实体或实体是非旁观者模式玩家
                this.renderedEntities++;
                if (entity.tickCount == 0) {
                    entity.xOld = entity.getX();
                    entity.yOld = entity.getY();
                    entity.zOld = entity.getZ();
                }

                MultiBufferSource multibuffersource;
                if (this.shouldShowEntityOutlines() && this.minecraft.shouldEntityAppearGlowing(entity)) {//如果该实体可以有发光效果
                    flag2 = true;//flag2在后面的代码中被使用。如果flag2为true，则会激活一系列有关实体高亮描边的渲染后处理
                    OutlineBufferSource outlinebuffersource = this.renderBuffers.outlineBufferSource();//特殊的发光描边处理器，可以在渲染常规生物信息的同时处理描边
                    multibuffersource = outlinebuffersource;
                    int i = entity.getTeamColor();
                    outlinebuffersource.setColor(FastColor.ARGB32.red(i), FastColor.ARGB32.green(i), FastColor.ARGB32.blue(i), 255);
                } else {
                    if (this.shouldShowEntityOutlines() && entity.hasCustomOutlineRendering(this.minecraft.player)) { // FORGE提供的额外钩子，允许自定义是否高亮。不过看样子基本没用。
                        flag2 = true;
                    }
                    multibuffersource = multibuffersource$buffersource;
                }

                float f2 = deltaTracker.getGameTimeDeltaPartialTick(!tickratemanager.isEntityFrozen(entity));
                this.renderEntity(entity, d0, d1, d2, f2, posestack, multibuffersource);//渲染实体
            }
        }
    }

    //实体渲染部分结束，批量提交一下实体有关的渲染内容并发布事件。这意味着在之后实体有关的渲染都不宜修改了。
    multibuffersource$buffersource.endLastBatch();
    this.checkPoseStack(posestack);
    multibuffersource$buffersource.endBatch(RenderType.entitySolid(TextureAtlas.LOCATION_BLOCKS));
    multibuffersource$buffersource.endBatch(RenderType.entityCutout(TextureAtlas.LOCATION_BLOCKS));
    multibuffersource$buffersource.endBatch(RenderType.entityCutoutNoCull(TextureAtlas.LOCATION_BLOCKS));
    multibuffersource$buffersource.endBatch(RenderType.entitySmoothCutout(TextureAtlas.LOCATION_BLOCKS));
    ClientHooks.dispatchRenderStage(RenderLevelStageEvent.Stage.AFTER_ENTITIES, this, posestack, frustumMatrix, projectionMatrix, this.ticks, camera, frustum);
    //......
}
```

### 方块实体BlockEntity与生物高光EntityOutline渲染

接下来是方块实体和生物边缘高光层：

```java
public void renderLevel(
        DeltaTracker deltaTracker, boolean renderBlockOutline, Camera camera, GameRenderer gameRenderer, LightTexture lightTexture, Matrix4f frustumMatrix, Matrix4f projectionMatrix
) {
    //......
    profilerfiller.popPush("blockentities");
    //遍历所有区块切片内可能可见的方块实体
    for (SectionRenderDispatcher.RenderSection sectionrenderdispatcher$rendersection : this.visibleSections) {
        List<BlockEntity> list = sectionrenderdispatcher$rendersection.getCompiled().getRenderableBlockEntities();
        if (!list.isEmpty()) {
            for (BlockEntity be : list) {
                if (!ClientHooks.isBlockEntityRendererVisible(blockEntityRenderDispatcher, be, frustum))//检查是否有额外方块实体渲染器且在视锥角范围内
                    continue;
                BlockPos pos = be.getBlockPos();
                MultiBufferSource bufferSource = multibuffersource$buffersource;
                posestack.pushPose();
                posestack.translate((double) pos.getX() - d0, (double) pos.getY() - d1, (double) pos.getZ() - d2);//将位置移动到摄像机相对方块的位置

                SortedSet<BlockDestructionProgress> sortedset = this.destructionProgress.get(pos.asLong());//获取方块的破坏信息列表
                if (sortedset != null && !sortedset.isEmpty()) {
                    int j = sortedset.last().getProgress();//考虑到可能一个方块在被多对象破坏，取最后值，也就是破坏进度最大的
                    if (j >= 0) {
                        PoseStack.Pose posestack$pose = posestack.last();
                        //创建一个特殊的顶点消费器，并与原有的消费器合并。这可以使常规渲染的同时附加一个方块破坏裂纹层
                        VertexConsumer vertexconsumer = new SheetedDecalTextureGenerator(
                                this.renderBuffers.crumblingBufferSource().getBuffer(ModelBakery.DESTROY_TYPES.get(j)), posestack$pose, 1.0F
                        );
                        bufferSource = type -> {
                            VertexConsumer vertexconsumer3 = multibuffersource$buffersource.getBuffer(type);//获取源消费器
                            return type.affectsCrumbling() ? VertexMultiConsumer.create(vertexconsumer, vertexconsumer3) : vertexconsumer3;//如果源消费器允许与破碎效果混合，创建混合消费器
                        };
                    }
                }

                //如果允许显示实体高光且方块实体对玩家启用该效果
                //感觉还是没有解决核心问题 实体渲染没有转换为MultiBufferSource传入，实体渲染没在final层上绘制内容，开了flag也没用
                //最好的解决方案应该还是给LevelRenderer#renderEntity或者类似的地方加个钩子 允许开发者修改传入的BufferSource
                if (this.shouldShowEntityOutlines() && be.hasCustomOutlineRendering(this.minecraft.player)) { // Neo: allow custom outline rendering
                    flag2 = true;
                }
                //执行方块实体额外渲染
                this.blockEntityRenderDispatcher.render(be, f, posestack, bufferSource);
                posestack.popPose();
            }
        }
    }

    //处理全局方块实体的内容 与上面类似
    synchronized (this.globalBlockEntities) {
        for (BlockEntity blockentity : this.globalBlockEntities) {
            if (!ClientHooks.isBlockEntityRendererVisible(blockEntityRenderDispatcher, blockentity, frustum))
                continue;
            BlockPos blockpos3 = blockentity.getBlockPos();
            posestack.pushPose();
            posestack.translate((double) blockpos3.getX() - d0, (double) blockpos3.getY() - d1, (double) blockpos3.getZ() - d2);
            //有一说一看这注释 我怀疑这套设计是不是只允许开发自己的实体的时候加边缘发光效果
            if (this.shouldShowEntityOutlines() && blockentity.hasCustomOutlineRendering(this.minecraft.player)) { // Neo: allow custom outline rendering
                flag2 = true;
            }
            this.blockEntityRenderDispatcher.render(blockentity, f, posestack, multibuffersource$buffersource);
            posestack.popPose();
        }
    }

    this.checkPoseStack(posestack);
    //提交一下方块实体有关的渲染内容
    multibuffersource$buffersource.endBatch(RenderType.solid());
    multibuffersource$buffersource.endBatch(RenderType.endPortal());
    multibuffersource$buffersource.endBatch(RenderType.endGateway());
    multibuffersource$buffersource.endBatch(Sheets.solidBlockSheet());
    multibuffersource$buffersource.endBatch(Sheets.cutoutBlockSheet());
    multibuffersource$buffersource.endBatch(Sheets.bedSheet());
    multibuffersource$buffersource.endBatch(Sheets.shulkerBoxSheet());
    multibuffersource$buffersource.endBatch(Sheets.signSheet());
    multibuffersource$buffersource.endBatch(Sheets.hangingSignSheet());
    multibuffersource$buffersource.endBatch(Sheets.chestSheet());
    this.renderBuffers.outlineBufferSource().endOutlineBatch();
    // Neo: handle outline effect requests outside glowing entities
    //这里开始 处理边缘发光实体效果
    if (this.outlineEffectRequested) {
        flag2 |= this.shouldShowEntityOutlines();
        this.outlineEffectRequested = false;
    }
    if (flag2) {
        //如果有边缘发光实体 执行边缘发光的后处理器 并重新主渲染目标
        this.entityEffect.process(deltaTracker.getGameTimeDeltaTicks());
        this.minecraft.getMainRenderTarget().bindWrite(false);
    }
    ClientHooks.dispatchRenderStage(RenderLevelStageEvent.Stage.AFTER_BLOCK_ENTITIES, this, posestack, frustumMatrix, projectionMatrix, this.ticks, camera, frustum);

    //......
}
```

### 方块破坏BlockDestroy与看向对象HitResultOutline渲染

处理常规方块破坏效果与看向对象：

```java
public void renderLevel(
        DeltaTracker deltaTracker, boolean renderBlockOutline, Camera camera, GameRenderer gameRenderer, LightTexture lightTexture, Matrix4f frustumMatrix, Matrix4f projectionMatrix
) {
    //......
    profilerfiller.popPush("destroyProgress");
    //遍历所有方块破坏信息
    for (Entry<SortedSet<BlockDestructionProgress>> entry : this.destructionProgress.long2ObjectEntrySet()) {
        BlockPos pos = BlockPos.of(entry.getLongKey());
        double xDistance = (double) pos.getX() - d0;
        double yDistance = (double) pos.getY() - d1;
        double zDistance = (double) pos.getZ() - d2;
        if (!(xDistance * xDistance + yDistance * yDistance + zDistance * zDistance > 1024.0)) {//如果破坏32格以外的方块，不显示纹理
            SortedSet<BlockDestructionProgress> sortedset1 = entry.getValue();
            if (sortedset1 != null && !sortedset1.isEmpty()) {
                int k = sortedset1.last().getProgress();
                posestack.pushPose();
                posestack.translate((double) pos.getX() - d0, (double) pos.getY() - d1, (double) pos.getZ() - d2);
                PoseStack.Pose pose = posestack.last();
                //创建顶点消费器 渲染方块破坏碎裂效果
                VertexConsumer vertexConsumer = new SheetedDecalTextureGenerator(
                        this.renderBuffers.crumblingBufferSource().getBuffer(ModelBakery.DESTROY_TYPES.get(k)), pose, 1.0F
                );
                ModelData modelData = level.getModelData(pos);
                this.minecraft
                        .getBlockRenderer()
                        .renderBreakingTexture(this.level.getBlockState(pos), pos, this.level, posestack, vertexConsumer, modelData);
                posestack.popPose();
            }
        }
    }

    //获取玩家视线指向结果
    HitResult hitresult = this.minecraft.hitResult;
    if (renderBlockOutline && hitresult != null && hitresult.getType() == HitResult.Type.BLOCK) {//如果视线目标为方块
        profilerfiller.popPush("outline");
        BlockPos blockpos1 = ((BlockHitResult) hitresult).getBlockPos();
        BlockState blockstate = this.level.getBlockState(blockpos1);
        if (!ClientHooks.onDrawHighlight(this, camera, hitresult, deltaTracker, posestack, multibuffersource$buffersource))//发布方块边缘渲染事件
            if (!blockstate.isAir() && this.level.getWorldBorder().isWithinBounds(blockpos1)) {
                VertexConsumer vertexconsumer2 = multibuffersource$buffersource.getBuffer(RenderType.lines());
                this.renderHitOutline(posestack, vertexconsumer2, camera.getEntity(), d0, d1, d2, blockpos1, blockstate);//渲染方块边缘
            }
    } else if (hitresult != null && hitresult.getType() == HitResult.Type.ENTITY) {
        ClientHooks.onDrawHighlight(this, camera, hitresult, deltaTracker, posestack, multibuffersource$buffersource);//发布实体边缘渲染事件
    }

    this.minecraft.debugRenderer.render(posestack, multibuffersource$buffersource, d0, d1, d2);
    //提交实体有关的渲染内容
    multibuffersource$buffersource.endLastBatch();
    multibuffersource$buffersource.endBatch(Sheets.translucentCullBlockSheet());
    multibuffersource$buffersource.endBatch(Sheets.bannerSheet());
    multibuffersource$buffersource.endBatch(Sheets.shieldSheet());
    multibuffersource$buffersource.endBatch(RenderType.armorEntityGlint());
    multibuffersource$buffersource.endBatch(RenderType.glint());
    multibuffersource$buffersource.endBatch(RenderType.glintTranslucent());
    multibuffersource$buffersource.endBatch(RenderType.entityGlint());
    multibuffersource$buffersource.endBatch(RenderType.entityGlintDirect());
    multibuffersource$buffersource.endBatch(RenderType.waterMask());
    this.renderBuffers.crumblingBufferSource().endBatch();//提交碎裂纹理有关的内容
    //......
}
```

### 半透明Translucent线String与粒子Particle渲染

然后是一些半透明有关的内容以及粒子效果：

```java
public void renderLevel(
        DeltaTracker deltaTracker, boolean renderBlockOutline, Camera camera, GameRenderer gameRenderer, LightTexture lightTexture, Matrix4f frustumMatrix, Matrix4f projectionMatrix
) {
    //......
    if (this.transparencyChain != null) {//如果后处理链存在，可以执行后处理任务
        multibuffersource$buffersource.endBatch(RenderType.lines());
        multibuffersource$buffersource.endBatch();
        //初始化半透明层，从主目标获取深度信息
        this.translucentTarget.clear(Minecraft.ON_OSX);
        this.translucentTarget.copyDepthFrom(this.minecraft.getMainRenderTarget());
        profilerfiller.popPush("translucent");
        this.renderSectionLayer(RenderType.translucent(), d0, d1, d2, frustumMatrix, projectionMatrix);//渲染半透明方块对象内容
        profilerfiller.popPush("string");
        this.renderSectionLayer(RenderType.tripwire(), d0, d1, d2, frustumMatrix, projectionMatrix);//渲染蛛线
        //初始化粒子效果层
        this.particlesTarget.clear(Minecraft.ON_OSX);
        this.particlesTarget.copyDepthFrom(this.minecraft.getMainRenderTarget());
        RenderStateShard.PARTICLES_TARGET.setupRenderState();//将渲染写入目标设置为粒子目标层
        profilerfiller.popPush("particles");
        this.minecraft.particleEngine.render(lightTexture, camera, f, frustum, type -> true);//调用粒子引擎渲染粒子效果
        ClientHooks.dispatchRenderStage(Stage.AFTER_PARTICLES, this, posestack, frustumMatrix, projectionMatrix, this.ticks, camera, frustum);
        RenderStateShard.PARTICLES_TARGET.clearRenderState();//结束粒子目标层写入状态
    } else {
        //优先渲染非半透明粒子，防止粒子被水遮挡
        // Neo: render solid particles before translucent geometry to match order of chunk render types, fixes solid particles disappearing underwater in Fast/Fancy (MC-161917)
        profilerfiller.popPush("solid_particles");
        this.minecraft.particleEngine.render(lightTexture, camera, f, frustum, type -> !type.isTranslucent());
        //初始化并渲染半透明层内容
        profilerfiller.popPush("translucent");
        if (this.translucentTarget != null) {
            this.translucentTarget.clear(Minecraft.ON_OSX);
        }
        this.renderSectionLayer(RenderType.translucent(), d0, d1, d2, frustumMatrix, projectionMatrix);
        multibuffersource$buffersource.endBatch(RenderType.lines());
        multibuffersource$buffersource.endBatch();
        //渲染线
        profilerfiller.popPush("string");
        this.renderSectionLayer(RenderType.tripwire(), d0, d1, d2, frustumMatrix, projectionMatrix);
        //渲染半透明粒子效果
        profilerfiller.popPush("particles");
        this.minecraft.particleEngine.render(lightTexture, camera, f, frustum, type -> type.isTranslucent()); // Neo: only render translucent particles at this stage
        ClientHooks.dispatchRenderStage(Stage.AFTER_PARTICLES, this, posestack, frustumMatrix, projectionMatrix, this.ticks, camera, frustum);
    }
    //......
}
```

### 云层Cloud与天气效果Weather渲染

天气内容是最后被渲染的：

```java
public void renderLevel(
        DeltaTracker deltaTracker, boolean renderBlockOutline, Camera camera, GameRenderer gameRenderer, LightTexture lightTexture, Matrix4f frustumMatrix, Matrix4f projectionMatrix
) {
    //......
    //如果开启了云层效果，渲染云层
    if (this.minecraft.options.getCloudsType() != CloudStatus.OFF) {
        //如果后处理链存在，清除缓存
        if (this.transparencyChain != null) {
            this.cloudsTarget.clear(Minecraft.ON_OSX);
        }

        profilerfiller.popPush("clouds");
        //在这个方法中会调用level.effects().renderClouds(...)，用于让维度自定义云层渲染效果。如果返回true，则表示代理云层渲染。
        this.renderClouds(posestack, frustumMatrix, projectionMatrix, f, d0, d1, d2);
    }

    if (this.transparencyChain != null) {//如果可以使用后处理链
        RenderStateShard.WEATHER_TARGET.setupRenderState();//绑定天气层为渲染写入目标，将天气内容绘制至独立渲染对象
        profilerfiller.popPush("weather");
        this.renderSnowAndRain(lightTexture, f, d0, d1, d2);//渲染雨雪效果
        ClientHooks.dispatchRenderStage(Stage.AFTER_WEATHER, this, posestack, frustumMatrix, projectionMatrix, this.ticks, camera, frustum);
        this.renderWorldBorder(camera);//渲染世界边界框
        RenderStateShard.WEATHER_TARGET.clearRenderState();
        this.transparencyChain.process(deltaTracker.getGameTimeDeltaTicks());//执行后处理链，混合图层
        this.minecraft.getMainRenderTarget().bindWrite(false);
    } else {//否则 直接将内容渲染至主渲染对象
        RenderSystem.depthMask(false);
        profilerfiller.popPush("weather");
        this.renderSnowAndRain(lightTexture, f, d0, d1, d2);
        ClientHooks.dispatchRenderStage(Stage.AFTER_WEATHER, this, posestack, frustumMatrix, projectionMatrix, this.ticks, camera, frustum);
        this.renderWorldBorder(camera);
        RenderSystem.depthMask(true);
    }
    //......
}
```

### 状态回收

```java
public void renderLevel(
        DeltaTracker deltaTracker, boolean renderBlockOutline, Camera camera, GameRenderer gameRenderer, LightTexture lightTexture, Matrix4f frustumMatrix, Matrix4f projectionMatrix
) {
    //......
    this.renderDebug(posestack, multibuffersource$buffersource, camera);
    multibuffersource$buffersource.endLastBatch();
    matrix4fstack.popMatrix();
    RenderSystem.applyModelViewMatrix();
    RenderSystem.depthMask(true);
    RenderSystem.disableBlend();
    FogRenderer.setupNoFog();
    //......
}
```

## 补充随记

### 实体火焰EntityFrame渲染

> 执行方法: `EntityRenderDispatcher#renderFlame`
>
> STACKTRACE:
>
> - `EntityRenderDispatcher#render L164`
> - `LevelRenderer#renderEntity L1267`
> - `LevelRenderer#renderLevel L1041`

```java
private void renderFlame(PoseStack poseStack, MultiBufferSource buffer, Entity entity, Quaternionf quaternion) {
    TextureAtlasSprite fire0 = ModelBakery.FIRE_0.sprite();
    TextureAtlasSprite fire1 = ModelBakery.FIRE_1.sprite();
    poseStack.pushPose();
    float fireSize = entity.getBbWidth() * 1.4F;
    poseStack.scale(fireSize, fireSize, fireSize);//根据实体大小缩放构成堆
    float size = 0.5F;
    float f3 = entity.getBbHeight() / fireSize;
    float y = 0.0F;
    poseStack.mulPose(quaternion);//将方向旋转至水平朝向玩家
    poseStack.translate(0.0F, 0.0F, 0.3F - (float) ((int) f3) * 0.02F);//略微后移位置
    float z = 0.0F;
    int i = 0;
    VertexConsumer vertexconsumer = buffer.getBuffer(Sheets.cutoutBlockSheet());

    for (PoseStack.Pose posestack$pose = poseStack.last(); f3 > 0.0F; i++) {//轮换使用两种火焰材质
        TextureAtlasSprite sprite = i % 2 == 0 ? fire0 : fire1;
        float f6 = sprite.getU0();
        float f7 = sprite.getV0();
        float f8 = sprite.getU1();
        float f9 = sprite.getV1();
        if (i / 2 % 2 == 0) {//轮流水平镜像纹理
            float f10 = f8;
            f8 = f6;
            f6 = f10;
        }

        fireVertex(posestack$pose, vertexconsumer, -size - 0.0F, 0.0F - y, z, f8, f9);
        fireVertex(posestack$pose, vertexconsumer, size - 0.0F, 0.0F - y, z, f6, f9);
        fireVertex(posestack$pose, vertexconsumer, size - 0.0F, 1.4F - y, z, f6, f7);
        fireVertex(posestack$pose, vertexconsumer, -size - 0.0F, 1.4F - y, z, f8, f7);
        f3 -= 0.45F;
        y -= 0.45F;//向上抬升火焰位置
        size *= 0.9F;//逐步缩小火焰纹理大小
        z -= 0.03F;//向后移动火焰位置
    }

    poseStack.popPose();
}

private static void fireVertex(
        PoseStack.Pose matrixEntry, VertexConsumer buffer, float x, float y, float z, float texU, float texV
) {
    buffer.addVertex(matrixEntry, x, y, z)
            .setColor(-1)//设置混合颜色
            .setUv(texU, texV)//设置主纹理
            .setUv1(0, 10)//设置overlay纹理，(0,10)代表不变化，指向OverlayTexture
            .setLight(240)//设置光照，即uv2。指向LightTexture，这一材质会随时间更新，由blockLight与skyLight混合构成，实现光照效果。
            .setNormal(matrixEntry, 0.0F, 1.0F, 0.0F);
}

```

### 实体阴影EntityShadow渲染

> 执行方法: `EntityRenderDispatcher#renderShadow`
>
> STACKTRACE:
>
> - `EntityRenderDispatcher#render L174`
> - `LevelRenderer#renderEntity L1267`
> - `LevelRenderer#renderLevel L1041`

游戏内渲染实体阴影的方法比较奇妙，简单来说，是遍历阴影范围内的方块，
对于每个方块的顶面，根据环境亮度，摄像机距离等信息，绘制阴影贴图的一部分。

换言之，实体脚下的圆形阴影是被“拼起来”的，而非一次性渲染而成。

实体的阴影在脚下会渲染多层，虽然说大部分阴影会“正好”满足一定条件，例如被掩埋的方块亮度小于需求亮度而被阻止渲染。

```java
private static void renderShadow(
        //当前poseStack为entityPos - camPos  常规生物的weight都是1，经验球和物品实体小一点，是0.75
        PoseStack poseStack, MultiBufferSource buffer, Entity entity, float weight, float partialTicks, LevelReader level, float size
) {
    //时间插值计算实体位置
    double x = Mth.lerp((double) partialTicks, entity.xOld, entity.getX());
    double y = Mth.lerp((double) partialTicks, entity.yOld, entity.getY());
    double z = Mth.lerp((double) partialTicks, entity.zOld, entity.getZ());
    float shadowHeight = Math.min(weight / 0.5F, size);
    //计算阴影可以扩散到的水平与竖直范围
    int xMin = Mth.floor(x - (double) size);
    int xMax = Mth.floor(x + (double) size);
    int yMin = Mth.floor(y - (double) shadowHeight);
    int yMax = Mth.floor(y);
    int zMin = Mth.floor(z - (double) size);
    int zMax = Mth.floor(z + (double) size);
    PoseStack.Pose posestack$pose = poseStack.last();
    VertexConsumer vertexconsumer = buffer.getBuffer(SHADOW_RENDER_TYPE);
    BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();

    //遍历阴影布及范围内的方块
    for (int mutableZ = zMin; mutableZ <= zMax; mutableZ++) {
        for (int mutableX = xMin; mutableX <= xMax; mutableX++) {
            pos.set(mutableX, 0, mutableZ);
            ChunkAccess chunkaccess = level.getChunk(pos);
            //多层方块的效果挺怪的 比如说实体站在玻璃上，实体会投下好几层影子
            for (int yMutable = yMin; yMutable <= yMax; yMutable++) {
                pos.setY(yMutable);
                float shadowStrength = weight - (float) (y - (double) pos.getY()) * 0.5F;
                renderBlockShadow(posestack$pose, vertexconsumer, chunkaccess, level, pos, x, y, z, size, shadowStrength);
            }
        }
    }
}

private static void renderBlockShadow(
        PoseStack.Pose pose,
        VertexConsumer vertexConsumer,
        ChunkAccess chunk,
        LevelReader level,
        BlockPos pos,
        double x,
        double y,
        double z,
        float size,
        float weight
) {
    BlockPos blockpos = pos.below();
    BlockState blockstate = chunk.getBlockState(blockpos);
    //如果下方方块可见 本地亮度大于3 且为可投影方块
    if (blockstate.getRenderShape() != RenderShape.INVISIBLE && level.getMaxLocalRawBrightness(pos) > 3) {
        if (blockstate.isCollisionShapeFullBlock(chunk, blockpos)) {
            VoxelShape voxelshape = blockstate.getShape(chunk, blockpos);
            if (!voxelshape.isEmpty()) {
                //获取当前亮度
                float brightness = LightTexture.getBrightness(level.dimensionType(), level.getMaxLocalRawBrightness(pos));
                float shadowStrength = weight * 0.5F * brightness;//阴影透明度由实体距离方块的高度差 实体距离摄像机的距离 环境光亮度共同决定
                if (shadowStrength >= 0.0F) {
                    if (shadowStrength > 1.0F) {
                        shadowStrength = 1.0F;
                    }

                    int color = FastColor.ARGB32.color(Mth.floor(shadowStrength * 255.0F), 255, 255, 255);
                    AABB aabb = voxelshape.bounds();
                    double modelMinX = (double) pos.getX() + aabb.minX;
                    double modelMaxX = (double) pos.getX() + aabb.maxX;
                    double modelBottomY = (double) pos.getY() + aabb.minY;//何意味 我猜应该是要写blockPos.getY() + aabb.maxY
                    double modelMinZ = (double) pos.getZ() + aabb.minZ;
                    double modelMaxZ = (double) pos.getZ() + aabb.maxZ;
                    float modelRelativeMinX = (float) (modelMinX - x);
                    float modelRelativeMaxX = (float) (modelMaxX - x);
                    float modelRelativeBottomY = (float) (modelBottomY - y);
                    float modelRelativeMinZ = (float) (modelMinZ - z);
                    float modelRelativeMaxZ = (float) (modelMaxZ - z);
                    //计算阴影uv位置。相对位置/2size可以求出每个方块的四个顶角位置对应的阴影贴图uv
                    float f7 = -modelRelativeMinX / 2.0F / size + 0.5F;
                    float f8 = -modelRelativeMaxX / 2.0F / size + 0.5F;
                    float f9 = -modelRelativeMinZ / 2.0F / size + 0.5F;
                    float f10 = -modelRelativeMaxZ / 2.0F / size + 0.5F;
                    shadowVertex(pose, vertexConsumer, color, modelRelativeMinX, modelRelativeBottomY, modelRelativeMinZ, f7, f9);
                    shadowVertex(pose, vertexConsumer, color, modelRelativeMinX, modelRelativeBottomY, modelRelativeMaxZ, f7, f10);
                    shadowVertex(pose, vertexConsumer, color, modelRelativeMaxX, modelRelativeBottomY, modelRelativeMaxZ, f8, f10);
                    shadowVertex(pose, vertexConsumer, color, modelRelativeMaxX, modelRelativeBottomY, modelRelativeMinZ, f8, f9);
                }
            }
        }
    }
}

private static void shadowVertex(
        PoseStack.Pose pose, VertexConsumer consumer, int color, float offsetX, float offsetY, float offsetZ, float u, float v
) {
    Vector3f vector3f = pose.pose().transformPosition(offsetX, offsetY, offsetZ, new Vector3f());
    consumer.addVertex(vector3f.x(), vector3f.y(), vector3f.z(), color, u, v, OverlayTexture.NO_OVERLAY, 15728880, 0.0F, 1.0F, 0.0F);
}
```

### 云层Clouds渲染

> 执行方法: `LevelRenderer#renderClouds`
>
> STACKTRACE:
>
> - `LevelRenderer#renderLevel L1219`

云层并非每tick进行完整烘培渲染，而是在玩家位置改变或云层移动到一定程度后进行一次缓存重构。

具体而言，其由缓存与偏移两部分构成。

- 缓存构建了以当前玩家所处位置对应云块为中心，四周烘培出的云模型以及云层的颜色。
- 偏移是指玩家实际镜头位置相对云块中心位置的偏移量，附加偏移量使得玩家移动与云飘动后云的位置能平滑变换。

```java
public void renderClouds(PoseStack poseStack, Matrix4f frustumMatrix, Matrix4f projectionMatrix, float partialTick, double camX, double camY, double camZ) {
    if (level.effects().renderClouds(level, ticks, partialTick, poseStack, camX, camY, camZ, frustumMatrix, projectionMatrix))//调度执行维度自定义云层渲染
        return;
    float cloudHeight = this.level.effects().getCloudHeight();//检查云层高度
    if (!Float.isNaN(cloudHeight)) {
        float CLOUD_SIZE = 12.0F;
        float CLOUD_THICKNESS = 4.0F;
        double COLOR_DELTA = 2.0E-4;

        double cloudOffset = ((float) this.ticks + partialTick) * 0.03F;//云层缓缓沿X轴飘动
        //计算云层在相机处的网格位置
        double cloudGridX = (camX + cloudOffset) / CLOUD_SIZE;
        double cloudGridZ = camZ / CLOUD_SIZE + 0.33F;
        //计算云与相机的相对高差
        double relativeCloudHeight = cloudHeight - (float) camY + 0.33F;
        //减去2048的整数倍 钳制数值范围
        cloudGridX -= (double) (Mth.floor(cloudGridX / 2048.0) * 2048);
        cloudGridZ -= (double) (Mth.floor(cloudGridZ / 2048.0) * 2048);
        //计算材质uv偏移量与竖直偏移量
        float uvOffsetX = (float) (cloudGridX - (double) Mth.floor(cloudGridX));
        float uvOffsetZ = (float) (cloudGridZ - (double) Mth.floor(cloudGridZ));
        float offsetY = (float) (relativeCloudHeight / CLOUD_THICKNESS - (double) Mth.floor(relativeCloudHeight / CLOUD_THICKNESS)) * CLOUD_THICKNESS;
        Vec3 cloudColor = this.level.getCloudColor(partialTick);
        //更新云层中心位置
        int cloudX = (int) Math.floor(cloudGridX);
        int cloudY = (int) Math.floor(relativeCloudHeight / CLOUD_THICKNESS);
        int cloudZ = (int) Math.floor(cloudGridZ);
        if (cloudX != this.prevCloudX
                || cloudY != this.prevCloudY
                || cloudZ != this.prevCloudZ
                || this.minecraft.options.getCloudsType() != this.prevCloudsType
                || this.prevCloudColor.distanceToSqr(cloudColor) > COLOR_DELTA) {//如果颜色差过大
            this.prevCloudX = cloudX;
            this.prevCloudY = cloudY;
            this.prevCloudZ = cloudZ;
            this.prevCloudColor = cloudColor;
            this.prevCloudsType = this.minecraft.options.getCloudsType();
            this.generateClouds = true;//标记需要重建云层缓存
        }

        if (this.generateClouds) {
            this.generateClouds = false;
            if (this.cloudBuffer != null) {
                this.cloudBuffer.close();//清理旧的云层顶点缓冲
            }
            this.cloudBuffer = new VertexBuffer(VertexBuffer.Usage.STATIC);
            this.cloudBuffer.bind();
            //更新新的云层顶点缓冲，以解算出的新云层中心位置像周围扩散形成玩家头顶的云层范围
            //如果为高品质云，构造立体云层效果。
            this.cloudBuffer.upload(this.buildClouds(Tesselator.getInstance(), cloudGridX, relativeCloudHeight, cloudGridZ, cloudColor));
            VertexBuffer.unbind();
        }

        FogRenderer.levelFogColor();
        poseStack.pushPose();
        poseStack.mulPose(frustumMatrix);
        poseStack.scale(12.0F, 1.0F, 12.0F);
        poseStack.translate(-uvOffsetX, offsetY, -uvOffsetZ);
        if (this.cloudBuffer != null) {
            this.cloudBuffer.bind();
            int l = this.prevCloudsType == CloudStatus.FANCY ? 0 : 1;//如果是高品质

            for (int i1 = l; i1 < 2; i1++) {
                //如果为高品质云 额外添加一层云的深度写入
                //这一步优先将最浅深度写入渲染对象，这样只有满足最浅深度位置云颜色才会被绘制，防止内夹角处被部分遮挡的云层渲染多层形成奇怪的效果。
                //这一写法是将半透明对象以类似不透明的方法进行深度测试处理，舍弃半透明的重叠效果。
                //当然 我们这么说只是为了展示这种写法的**应有**的效果，至于mojang为什么要这么写……
                //请看代码后面的注解部分
                RenderType rendertype = i1 == 0 ? RenderType.cloudsDepthOnly() : RenderType.clouds();
                rendertype.setupRenderState();
                ShaderInstance shaderinstance = RenderSystem.getShader();
                this.cloudBuffer.drawWithShader(poseStack.last().pose(), projectionMatrix, shaderinstance);
                rendertype.clearRenderState();
            }

            VertexBuffer.unbind();
        }

        poseStack.popPose();
    }
}
```

> 我们有必要解释一下上面提到的，mojang为什么采用了先写入深度再写入颜色的方法来处理云层：
> 通过renderdoc可以看到`buildClouds(Tesselator.getInstance(), cloudGridX, relativeCloudHeight, cloudGridZ, cloudColor)`
> 生成了的内容：
> ![clash](/render/cloud_mesh.png)
> 也就是说每个云块单元格的侧面都是被渲染了的。
>
> 这里也能解释为什么上面要通过检查y单元来更新云层缓存，这张图上只有顶部被一个大贴图渲染，底部则是空的。
> 高度有关的缓存有且只与这个有关。
>
> 如果不先写入深度的话，半透明层的排序将完全不可控，将会产生下面的效果：
> ![clash](/render/cloud_no_depth_problem.png)
> AMAZING MOJANG CODING!
>
> 当然 更高版本中这部分内容已经被优化了，有更为优雅的全面面剔除：
> ![clash](/render/cloud_code_highver.png)
> 感谢渲染重构吧！
> 也感谢AR大佬对这部分代码的分析与测试！

