---
writers:
  - MonLandis
versions:
  id: "chunk_render"
  vanilla: "1.21.1"
  loaders:
    - text: "Neoforge 21.1.213"
      loader: "neoforge"  
---

# 区块渲染(仅阅读)

区块任务分为两种类型，核心接口方法为`SectionRenderDispatcher.RenderSection.CompileTask#doTask`

- 层重排任务，一般是因摄像头移动导致，需要重新计算各种渲染类型的方块层顺序，剔除不可见面等。
- 重建任务，一般是方块被更改而导致，需要完整的重新烘培整个区块的模型。

区块任务的执行也分为三种：

- 同步编译：对于近距离区块，立刻执行区块重建任务，以保证最快的玩家交互更改。
- 异步高优先级编译：对于中距离区块或者层重排任务，为高优先级编译任务，会在异步的执行中优先执行。
- 异步低优先级编译：对于远距离区块，为低优先级编译任务，通常不具有紧急信息要素，只会在没有高优先级任务时被执行。

在此之前，我们要首先了解一下哪些区块可能成为候选的任务执行区块。

这些区块被存储在`LevelRenderer.visibleSections`中，根据广度优先算法计算而出，这意味着越靠前的元素越靠近相机。

围绕着可见区块切片列表的加载，我们需要先了解一下整个相机视锥角初始化部分的内容。

## 相机视锥角初始化

如下，这是整个渲染周期最开始处对相机进行初始化部分执行的方法：

```java
private void setupRender(Camera camera, Frustum frustum, boolean hasCapturedFrustum, boolean isSpectator) {
    Vec3 vec3 = camera.getPosition();
    if (this.minecraft.options.getEffectiveRenderDistance() != this.lastViewDistance) {
        this.allChanged();
    }

    this.level.getProfiler().push("camera");
    double d0 = this.minecraft.player.getX();
    double d1 = this.minecraft.player.getY();
    double d2 = this.minecraft.player.getZ();
    int i = SectionPos.posToSectionCoord(d0);
    int j = SectionPos.posToSectionCoord(d1);
    int k = SectionPos.posToSectionCoord(d2);
    if (this.lastCameraSectionX != i || this.lastCameraSectionY != j || this.lastCameraSectionZ != k) {
        this.lastCameraSectionX = i;
        this.lastCameraSectionY = j;
        this.lastCameraSectionZ = k;
        this.viewArea.repositionCamera(d0, d2);
    }

    this.sectionRenderDispatcher.setCamera(vec3);
    this.level.getProfiler().popPush("cull");
    this.minecraft.getProfiler().popPush("culling");
    BlockPos blockpos = camera.getBlockPosition();
    double d3 = Math.floor(vec3.x / 8.0);
    double d4 = Math.floor(vec3.y / 8.0);
    double d5 = Math.floor(vec3.z / 8.0);
    if (d3 != this.prevCamX || d4 != this.prevCamY || d5 != this.prevCamZ) {
        this.sectionOcclusionGraph.invalidate();
    }

    this.prevCamX = d3;
    this.prevCamY = d4;
    this.prevCamZ = d5;
    this.minecraft.getProfiler().popPush("update");
    if (!hasCapturedFrustum) {
        boolean flag = this.minecraft.smartCull;
        if (isSpectator && this.level.getBlockState(blockpos).isSolidRender(this.level, blockpos)) {
            flag = false;
        }

        Entity.setViewScale(
                Mth.clamp((double) this.minecraft.options.getEffectiveRenderDistance() / 8.0, 1.0, 2.5) * this.minecraft.options.entityDistanceScaling().get()
        );
        this.minecraft.getProfiler().push("section_occlusion_graph");
        this.sectionOcclusionGraph.update(flag, camera, frustum, this.visibleSections);//在这里，执行可见区块切片重排有关内容。
        this.minecraft.getProfiler().pop();
        double d6 = Math.floor((double) (camera.getXRot() / 2.0F));
        double d7 = Math.floor((double) (camera.getYRot() / 2.0F));
        if (this.sectionOcclusionGraph.consumeFrustumUpdate() || d6 != this.prevCamRotX || d7 != this.prevCamRotY) {
            this.applyFrustum(offsetFrustum(frustum));//如果执行了完整可见区块切片重排，将新结果覆盖visibleSections
            this.prevCamRotX = d6;
            this.prevCamRotY = d7;
        }
    }

    this.minecraft.getProfiler().pop();
}

```

```java

//这个方法在渲染最开头被调用，用于根据相机位置剪切视野外的不可见对象
public void update(boolean smartCull, Camera camera, Frustum frustum, List<SectionRenderDispatcher.RenderSection> sections) {
    Vec3 vec3 = camera.getPosition();
    if (this.needsFullUpdate && (this.fullUpdateTask == null || this.fullUpdateTask.isDone())) {
        this.scheduleFullUpdate(smartCull, camera, vec3);
    }

    this.runPartialUpdate(smartCull, frustum, sections, vec3);
}

/**计划全部的可见区块切片重排。
 * 这一方法首先搜索相机或附近的可用可见区块切片，并以此为初始位置，
 * 基于广度优先算法与视锥角剔除计算出可见的所有区块切片，并标记视锥角需要更新。
 * 在此之后，LevelRenderer#setupRender方法中的后续代码将会把新计算的可见区块切片添加至visibleSections。
 * */
private void scheduleFullUpdate(boolean smartCull, Camera camera, Vec3 cameraPosition) {
    this.needsFullUpdate = false;
    this.fullUpdateTask = Util.backgroundExecutor().submit(() -> {//将整个处理提交至背景线程
        SectionOcclusionGraph.GraphState sectionocclusiongraph$graphstate = new SectionOcclusionGraph.GraphState(this.viewArea.sections.length);
        this.nextGraphEvents.set(sectionocclusiongraph$graphstate.events);
        Queue<SectionOcclusionGraph.Node> queue = Queues.newArrayDeque();
        this.initializeQueueForFullUpdate(camera, queue);//根据相机位置初始化queue列表
        queue.forEach(p_295724_ -> sectionocclusiongraph$graphstate.storage.sectionToNodeMap.put(p_295724_.section, p_295724_));//将起始点提交至可见区块切片存储中
        //执行更新，通过BFS算法，结合视锥角剔除等，将被计算为可见的区块切片提交至存储
        this.runUpdates(sectionocclusiongraph$graphstate.storage, cameraPosition, queue, smartCull, p_294678_ -> {
        });
        this.currentGraph.set(sectionocclusiongraph$graphstate);//提交结果
        this.nextGraphEvents.set(null);
        //标记需要视锥角更新。
        this.needsFrustumUpdate.set(true);
    });
}

//部分更新
private void runPartialUpdate(boolean smartCull, Frustum p_frustum, List<SectionRenderDispatcher.RenderSection> sections, Vec3 cameraPosition) {
    SectionOcclusionGraph.GraphState graphstate = this.currentGraph.get();
    this.queueSectionsWithNewNeighbors(graphstate);//将有新的，四周相邻区块均有效的区块切片找出
    if (!graphstate.events.sectionsToPropagateFrom.isEmpty()) {//检查是否有需要更新的区块
        Queue<SectionOcclusionGraph.Node> queue = Queues.newArrayDeque();

        while (!graphstate.events.sectionsToPropagateFrom.isEmpty()) {//将状态变化的区块切片内容添加为可处理的对象
            SectionRenderDispatcher.RenderSection rendersection = graphstate.events
                    .sectionsToPropagateFrom
                    .poll();
            SectionOcclusionGraph.Node sectionocclusiongraph$node = graphstate.storage
                    .sectionToNodeMap
                    .get(rendersection);
            if (sectionocclusiongraph$node != null && sectionocclusiongraph$node.section == rendersection) {
                queue.add(sectionocclusiongraph$node);
            }
        }

        //更新视锥角范围，创建执行成功消费器(即将内容添加进LevelRenderer.visibleSections)
        Frustum frustum = LevelRenderer.offsetFrustum(p_frustum);
        Consumer<SectionRenderDispatcher.RenderSection> consumer = p_295778_ -> {
            if (frustum.isVisible(p_295778_.getBoundingBox())) {
                sections.add(p_295778_);
            }
        };
        this.runUpdates(graphstate.storage, cameraPosition, queue, smartCull, consumer);
    }
}

//从相邻有区块更新的区块列表中挑选出四周区块都已存在的区块。
private void queueSectionsWithNewNeighbors(SectionOcclusionGraph.GraphState graphState) {
    LongIterator longiterator = graphState.events.chunksWhichReceivedNeighbors.iterator();//检查相邻区块已更新的所有区块

    while (longiterator.hasNext()) {
        long i = longiterator.nextLong();
        List<SectionRenderDispatcher.RenderSection> list = graphState.storage.chunksWaitingForNeighbors.get(i);
        if (list != null && list.get(0).hasAllNeighbors()) {//如果该区块(这里的list就是这一区块列里所有区块切片)拥有所有相邻区块
            graphState.events.sectionsToPropagateFrom.addAll(list);//将该区块添加至需要更新的列表
            graphState.storage.chunksWaitingForNeighbors.remove(i);//从等待相邻区块的区块列表内移除该区块
        }
    }

    graphState.events.chunksWhichReceivedNeighbors.clear();//清除相邻区块更新的区块列表
}

private void initializeQueueForFullUpdate(Camera camera, Queue<SectionOcclusionGraph.Node> nodeQueue) {
    int i = 16;
    Vec3 vec3 = camera.getPosition();
    BlockPos blockpos = camera.getBlockPosition();
    SectionRenderDispatcher.RenderSection sectionrenderdispatcher$rendersection = this.viewArea.getRenderSectionAt(blockpos);//获取摄像机所在位置的区块切片
    if (sectionrenderdispatcher$rendersection == null) {
        LevelHeightAccessor levelheightaccessor = this.viewArea.getLevelHeightAccessor();
        boolean flag = blockpos.getY() > levelheightaccessor.getMinBuildHeight();
        //如果当前位置在世界最低高度之下，将切片高度位置移动到世界底部；若高于最低高度，移动到世界顶部。
        int j = flag ? levelheightaccessor.getMaxBuildHeight() - 8 : levelheightaccessor.getMinBuildHeight() + 8;
        //获取区块坐标
        int k = Mth.floor(vec3.x / 16.0) * 16;
        int l = Mth.floor(vec3.z / 16.0) * 16;
        int i1 = this.viewArea.getViewDistance();
        List<SectionOcclusionGraph.Node> list = Lists.newArrayList();

        for (int j1 = -i1; j1 <= i1; j1++) {//遍历视野区块范围内所有区块对象
            for (int k1 = -i1; k1 <= i1; k1++) {
                SectionRenderDispatcher.RenderSection sectionrenderdispatcher$rendersection1 = this.viewArea
                        .getRenderSectionAt(new BlockPos(k + SectionPos.sectionToBlockCoord(j1, 8), j, l + SectionPos.sectionToBlockCoord(k1, 8)));
                //如果找到了一个非空的区块切片
                if (sectionrenderdispatcher$rendersection1 != null && this.isInViewDistance(blockpos, sectionrenderdispatcher$rendersection1.getOrigin())) {
                    //配置节点的传播方向，使其符合摄像机可能看向的方向。若开启了smartCull，这将在runUpdates中BFS向反方向的扩散
                    Direction direction = flag ? Direction.DOWN : Direction.UP;
                    SectionOcclusionGraph.Node sectionocclusiongraph$node = new SectionOcclusionGraph.Node(
                            sectionrenderdispatcher$rendersection1, direction, 0
                    );
                    sectionocclusiongraph$node.setDirections(sectionocclusiongraph$node.directions, direction);
                    if (j1 > 0) {
                        sectionocclusiongraph$node.setDirections(sectionocclusiongraph$node.directions, Direction.EAST);
                    } else if (j1 < 0) {
                        sectionocclusiongraph$node.setDirections(sectionocclusiongraph$node.directions, Direction.WEST);
                    }

                    if (k1 > 0) {
                        sectionocclusiongraph$node.setDirections(sectionocclusiongraph$node.directions, Direction.SOUTH);
                    } else if (k1 < 0) {
                        sectionocclusiongraph$node.setDirections(sectionocclusiongraph$node.directions, Direction.NORTH);
                    }
                    //将配置好的节点加入列表
                    list.add(sectionocclusiongraph$node);
                }
            }
        }
        //按照与摄像机的距离重排列表
        list.sort(Comparator.comparingDouble(p_294459_ -> blockpos.distSqr(p_294459_.section.getOrigin().offset(8, 8, 8))));
        nodeQueue.addAll(list);
    } else {
        //若摄像机位置有节点，将摄像机当前位置的节点添加至列表
        nodeQueue.add(new SectionOcclusionGraph.Node(sectionrenderdispatcher$rendersection, null, 0));
    }
}

//更新可见范围内的区块切片
private void runUpdates(
        SectionOcclusionGraph.GraphStorage graphStorage,
        Vec3 cameraPosition,
        Queue<SectionOcclusionGraph.Node> nodeQueue,
        boolean smartCull,
        Consumer<SectionRenderDispatcher.RenderSection> sections
) {
    int i = 16;
    BlockPos blockpos = new BlockPos(Mth.floor(cameraPosition.x / 16.0) * 16, Mth.floor(cameraPosition.y / 16.0) * 16, Mth.floor(cameraPosition.z / 16.0) * 16);
    BlockPos blockpos1 = blockpos.offset(8, 8, 8);

    while (!nodeQueue.isEmpty()) {//遍历当前节点列表
        SectionOcclusionGraph.Node sectionocclusiongraph$node = nodeQueue.poll();
        SectionRenderDispatcher.RenderSection sectionrenderdispatcher$rendersection = sectionocclusiongraph$node.section;
        if (graphStorage.renderSections.add(sectionocclusiongraph$node)) {//BFS算法的经典操作 标记已遍及的位置
            sections.accept(sectionocclusiongraph$node.section);
        }

        //如果区块切片在轴上的距离大于60 也就是大概三四个区块的距离
        boolean flag = Math.abs(sectionrenderdispatcher$rendersection.getOrigin().getX() - blockpos.getX()) > 60
                || Math.abs(sectionrenderdispatcher$rendersection.getOrigin().getY() - blockpos.getY()) > 60
                || Math.abs(sectionrenderdispatcher$rendersection.getOrigin().getZ() - blockpos.getZ()) > 60;

        //获取与该区块切片相邻的区块切片对象
        for (Direction direction : DIRECTIONS) {
            SectionRenderDispatcher.RenderSection sectionrenderdispatcher$rendersection1 = this.getRelativeFrom(
                    blockpos, sectionrenderdispatcher$rendersection, direction
            );
            //如果其区块切片非空。开启智能剪切后，将会阻止反方向的传播以进一步节省性能
            if (sectionrenderdispatcher$rendersection1 != null && (!smartCull || !sectionocclusiongraph$node.hasDirection(direction.getOpposite()))) {
                //如果启用了只能剪切且对象具有源方向信息
                if (smartCull && sectionocclusiongraph$node.hasSourceDirections()) {
                    SectionRenderDispatcher.CompiledSection sectionrenderdispatcher$compiledsection = sectionrenderdispatcher$rendersection.getCompiled();
                    boolean flag1 = false;

                    for (int j = 0; j < DIRECTIONS.length; j++) {
                        //检查视野穿透性 这一功能其实有点抽象
                        //简单来说，facesCanSeeEachother基于区块切片的VisibilitySet，而这一数据是在区块的构建任务(BuildTask)时被生产的。
                        //其内部原理是，渲染固体方块时会在数据集中进行标记；在构建VisibilitySet的过程中，将根据标记的固体方块数量进行处理
                        //如果固体方块数据过少(<256)，会认为无法填满空间，即所有面均可互相看到；若全部填充则都不能被看到。
                        //如果数量居中，则会使用洪水规则处理，从每个面上的空位置开始扩散，计算可以接触到哪些其它面。
                        //基于上述规则，可以得出外表面间可能的透视规则，从而辅助计算区块切片的视野扩散。
                        if (sectionocclusiongraph$node.hasSourceDirection(j)
                                && sectionrenderdispatcher$compiledsection.facesCanSeeEachother(DIRECTIONS[j].getOpposite(), direction)) {
                            flag1 = true;
                            break;
                        }
                    }

                    //如果未通过透视测试，跳到下一个
                    if (!flag1) {
                        continue;
                    }
                }

                //如果启用智能剪切且距离远 启用摄像机模拟视线 这是一个从目标区块向摄像机发射的射线
                if (smartCull && flag) {
                    BlockPos blockpos2 = sectionrenderdispatcher$rendersection1.getOrigin();
                    //射线起点位置转移至靠近摄像机的表面
                    BlockPos blockpos3 = blockpos2.offset(
                            (direction.getAxis() == Direction.Axis.X ? blockpos1.getX() <= blockpos2.getX() : blockpos1.getX() >= blockpos2.getX()) ? 0 : 16,
                            (direction.getAxis() == Direction.Axis.Y ? blockpos1.getY() <= blockpos2.getY() : blockpos1.getY() >= blockpos2.getY()) ? 0 : 16,
                            (direction.getAxis() == Direction.Axis.Z ? blockpos1.getZ() <= blockpos2.getZ() : blockpos1.getZ() >= blockpos2.getZ()) ? 0 : 16
                    );
                    Vec3 vec31 = new Vec3((double) blockpos3.getX(), (double) blockpos3.getY(), (double) blockpos3.getZ());//构造射线起始位置
                    Vec3 vec3 = cameraPosition.subtract(vec31).normalize().scale(CEILED_SECTION_DIAGONAL);//构造取样单位步长
                    boolean flag2 = true;

                    while (cameraPosition.subtract(vec31).lengthSqr() > 3600.0) {
                        vec31 = vec31.add(vec3);
                        LevelHeightAccessor levelheightaccessor = this.viewArea.getLevelHeightAccessor();
                        //如果视线超出地图高度边界 结束追踪
                        if (vec31.y > (double) levelheightaccessor.getMaxBuildHeight() || vec31.y < (double) levelheightaccessor.getMinBuildHeight()) {
                            break;
                        }

                        SectionRenderDispatcher.RenderSection sectionrenderdispatcher$rendersection2 = this.viewArea
                                .getRenderSectionAt(BlockPos.containing(vec31.x, vec31.y, vec31.z));
                        //若经过的节点未被加载，即已知被阻挡；或对象是另一个需要被处理的对象，结束追踪并
                        if (sectionrenderdispatcher$rendersection2 == null
                                || graphStorage.sectionToNodeMap.get(sectionrenderdispatcher$rendersection2) == null) {
                            flag2 = false;
                            break;
                        }
                    }

                    if (!flag2) {
                        continue;
                    }
                }

                //获取节点信息
                SectionOcclusionGraph.Node sectionocclusiongraph$node1 = graphStorage.sectionToNodeMap.get(sectionrenderdispatcher$rendersection1);
                if (sectionocclusiongraph$node1 != null) {
                    //若节点非空，为其添加新的源方向
                    sectionocclusiongraph$node1.addSourceDirection(direction);
                } else {
                    //否则，创建新的节点并配置源方向
                    SectionOcclusionGraph.Node sectionocclusiongraph$node2 = new SectionOcclusionGraph.Node(
                            sectionrenderdispatcher$rendersection1, direction, sectionocclusiongraph$node.step + 1
                    );
                    sectionocclusiongraph$node2.setDirections(sectionocclusiongraph$node.directions, direction);
                    //如果拥有所有临近区块，添加到处理队列
                    if (sectionrenderdispatcher$rendersection1.hasAllNeighbors()) {
                        nodeQueue.add(sectionocclusiongraph$node2);
                        graphStorage.sectionToNodeMap.put(sectionrenderdispatcher$rendersection1, sectionocclusiongraph$node2);
                    } else if (this.isInViewDistance(blockpos, sectionrenderdispatcher$rendersection1.getOrigin())) {
                        //添加到等待临近区块队列
                        graphStorage.sectionToNodeMap.put(sectionrenderdispatcher$rendersection1, sectionocclusiongraph$node2);
                        graphStorage.chunksWaitingForNeighbors
                                .computeIfAbsent(ChunkPos.asLong(sectionrenderdispatcher$rendersection1.getOrigin()), p_294377_ -> new ArrayList<>())
                                .add(sectionrenderdispatcher$rendersection1);
                    }
                }
            }
        }
    }
}
```

## 区块切片层ChunkSectionLayer渲染

区块层渲染在渲染流程中被使用，用于将可见的区块切片内某一渲染类型的所有渲染结果绘制到渲染对象上。

```java
private void renderSectionLayer(RenderType renderType, double x, double y, double z, Matrix4f frustrumMatrix, Matrix4f projectionMatrix) {
    RenderSystem.assertOnRenderThread();
    renderType.setupRenderState();
    if (renderType == RenderType.translucent()) {//如果渲染类型为半透明
        this.minecraft.getProfiler().push("translucent_sort");
        double d0 = x - this.xTransparentOld;
        double d1 = y - this.yTransparentOld;
        double d2 = z - this.zTransparentOld;
        if (d0 * d0 + d1 * d1 + d2 * d2 > 1.0) {//检查相机移动距离 如果移动距离过大，更新相机位置并计划区块的层重排任务
            int i = SectionPos.posToSectionCoord(x);
            int j = SectionPos.posToSectionCoord(y);
            int k = SectionPos.posToSectionCoord(z);
            boolean flag = i != SectionPos.posToSectionCoord(this.xTransparentOld)
                    || k != SectionPos.posToSectionCoord(this.zTransparentOld)
                    || j != SectionPos.posToSectionCoord(this.yTransparentOld);
            this.xTransparentOld = x;
            this.yTransparentOld = y;
            this.zTransparentOld = z;
            int l = 0;

            //这里的visibleSections是通过BFS算出的，l<15基本可以保证重排的是最接近相机的一批
            for (SectionRenderDispatcher.RenderSection sectionrenderdispatcher$rendersection : this.visibleSections) {
                if (l < 15
                        && (flag || sectionrenderdispatcher$rendersection.isAxisAlignedWith(i, j, k))
                        && sectionrenderdispatcher$rendersection.resortTransparency(renderType, this.sectionRenderDispatcher)) {
                    l++;
                }
            }
        }

        this.minecraft.getProfiler().pop();
    }

    this.minecraft.getProfiler().push("filterempty");
    this.minecraft.getProfiler().popPush(() -> "render_" + renderType);
    boolean flag1 = renderType != RenderType.translucent();
    ObjectListIterator<SectionRenderDispatcher.RenderSection> objectlistiterator = this.visibleSections
            .listIterator(flag1 ? 0 : this.visibleSections.size());
    //初始化着色器
    ShaderInstance shaderinstance = RenderSystem.getShader();
    shaderinstance.setDefaultUniforms(VertexFormat.Mode.QUADS, frustrumMatrix, projectionMatrix, this.minecraft.getWindow());
    shaderinstance.apply();
    Uniform uniform = shaderinstance.CHUNK_OFFSET;

    //若为半透明，从远到近渲染区块切片；否则从近到远
    while (flag1 ? objectlistiterator.hasNext() : objectlistiterator.hasPrevious()) {
        SectionRenderDispatcher.RenderSection sectionrenderdispatcher$rendersection1 = flag1 ? objectlistiterator.next() : objectlistiterator.previous();
        if (!sectionrenderdispatcher$rendersection1.getCompiled().isEmpty(renderType)) {//检查区块切片内有没有对应渲染类型的方块
            VertexBuffer vertexbuffer = sectionrenderdispatcher$rendersection1.getBuffer(renderType);
            BlockPos blockpos = sectionrenderdispatcher$rendersection1.getOrigin();
            if (uniform != null) {
                //附加与摄像机的相对位置
                uniform.set(
                        (float) ((double) blockpos.getX() - x),
                        (float) ((double) blockpos.getY() - y),
                        (float) ((double) blockpos.getZ() - z)
                );
                uniform.upload();
            }

            vertexbuffer.bind();
            vertexbuffer.draw();
        }
    }

    //回收数据 清除状态残留 发布事件
    if (uniform != null) {
        uniform.set(0.0F, 0.0F, 0.0F);
    }

    shaderinstance.clear();
    VertexBuffer.unbind();
    this.minecraft.getProfiler().pop();
    net.neoforged.neoforge.client.ClientHooks.dispatchRenderStage(renderType, this, frustrumMatrix, projectionMatrix, this.ticks, this.minecraft.gameRenderer.getMainCamera(), this.getFrustum());
    renderType.clearRenderState();
}
```

## 区块重建任务

区块重建任务通常只会在一个区块被更改时被要求执行，用于生成一个区块的模型缓存。
可能的触发位置是`LevelRenderer#renderLevel L970`执行的`compileSections`。

```java
private void compileSections(Camera camera) {
    this.minecraft.getProfiler().push("populate_sections_to_compile");
    LevelLightEngine levellightengine = this.level.getLightEngine();
    RenderRegionCache renderregioncache = new RenderRegionCache();
    BlockPos blockpos = camera.getBlockPosition();
    List<SectionRenderDispatcher.RenderSection> list = Lists.newArrayList();

    for (SectionRenderDispatcher.RenderSection sectionrenderdispatcher$rendersection : this.visibleSections) {
        SectionPos sectionpos = SectionPos.of(sectionrenderdispatcher$rendersection.getOrigin());
        //如果区块发生变动且区域有光照 区域模型应当被重建
        if (sectionrenderdispatcher$rendersection.isDirty() && levellightengine.lightOnInSection(sectionpos)) {
            boolean flag = false;
            //如果区块重建模式为靠近且距离足够近，标记
            if (this.minecraft.options.prioritizeChunkUpdates().get() == PrioritizeChunkUpdates.NEARBY) {
                BlockPos blockpos1 = sectionrenderdispatcher$rendersection.getOrigin().offset(8, 8, 8);
                flag = blockpos1.distSqr(blockpos) < 768.0 || sectionrenderdispatcher$rendersection.isDirtyFromPlayer();
            } else if (this.minecraft.options.prioritizeChunkUpdates().get() == PrioritizeChunkUpdates.PLAYER_AFFECTED) {
                //如果模式为玩家影响
                flag = sectionrenderdispatcher$rendersection.isDirtyFromPlayer();
            }

            //根据是否标记，使用立刻同步编译或计划异步编译。
            //立刻同步编译将立刻做出反应但可能暂时阻塞线程。
            if (flag) {
                this.minecraft.getProfiler().push("build_near_sync");
                this.sectionRenderDispatcher.rebuildSectionSync(sectionrenderdispatcher$rendersection, renderregioncache);
                sectionrenderdispatcher$rendersection.setNotDirty();
                this.minecraft.getProfiler().pop();
            } else {
                list.add(sectionrenderdispatcher$rendersection);
            }
        }
    }

    this.minecraft.getProfiler().popPush("upload");
    this.sectionRenderDispatcher.uploadAllPendingUploads();
    this.minecraft.getProfiler().popPush("schedule_async_compile");

    //提交异步构建任务并清除dirty状态
    for (SectionRenderDispatcher.RenderSection sectionrenderdispatcher$rendersection1 : list) {
        sectionrenderdispatcher$rendersection1.rebuildSectionAsync(this.sectionRenderDispatcher, renderregioncache);
        sectionrenderdispatcher$rendersection1.setNotDirty();
    }

    this.minecraft.getProfiler().pop();
}
```

重建任务本身是这样的：

```java
public CompletableFuture<SectionRenderDispatcher.SectionTaskResult> doTask(SectionBufferBuilderPack sectionBufferBuilderPack) {
    //处理重建取消
    if (this.isCancelled.get()) {
        return CompletableFuture.completedFuture(SectionRenderDispatcher.SectionTaskResult.CANCELLED);
    } else if (!RenderSection.this.hasAllNeighbors()) {//如果周围区块未被加载，无法完成边界链接渲染
        this.cancel();
        return CompletableFuture.completedFuture(SectionRenderDispatcher.SectionTaskResult.CANCELLED);
    } else if (this.isCancelled.get()) {
        return CompletableFuture.completedFuture(SectionRenderDispatcher.SectionTaskResult.CANCELLED);
    } else {
        RenderChunkRegion renderchunkregion = this.region;
        this.region = null;
        if (renderchunkregion == null) {
            //如果这是一片空区域 只更新GlobalBlockEntities
            //globalBlockEntities即拥有方块实体渲染器，且shouldRenderOffScreen为true的方块，
            //这表明即便该方块被视锥角剔除或被遮挡，其实体渲染器仍然会执行渲染任务。信标光柱，结构方块边缘箱均在此列。
            //updateGlobalBlockEntities更新了区块内的全局方块实体，增删区块内的全局方块实体。
            RenderSection.this.updateGlobalBlockEntities(Set.of());
            RenderSection.this.setCompiled(SectionRenderDispatcher.CompiledSection.EMPTY);
            return CompletableFuture.completedFuture(SectionRenderDispatcher.SectionTaskResult.SUCCESSFUL);
        } else {
            SectionPos sectionpos = SectionPos.of(RenderSection.this.origin);
            //编译区块内容。这里面包含方块实体列表与RenderType->MeshData的渲染层表。
            SectionCompiler.Results result = SectionRenderDispatcher.this.sectionCompiler
                    .compile(sectionpos, renderchunkregion, RenderSection.this.createVertexSorting(), sectionBufferBuilderPack, this.additionalRenderers);
            RenderSection.this.updateGlobalBlockEntities(result.globalBlockEntities);
            if (this.isCancelled.get()) {//检查取消
                result.release();
                return CompletableFuture.completedFuture(SectionRenderDispatcher.SectionTaskResult.CANCELLED);
            } else {
                //将编译结果复制进CompiledSection
                SectionRenderDispatcher.CompiledSection compiledsection = new SectionRenderDispatcher.CompiledSection();
                compiledsection.visibilitySet = result.visibilitySet;
                compiledsection.renderableBlockEntities.addAll(result.blockEntities);
                compiledsection.transparencyState = result.transparencyState;
                List<CompletableFuture<Void>> list = new ArrayList<>(result.renderedLayers.size());
                result.renderedLayers.forEach((renderType, meshData) -> {
                    list.add(SectionRenderDispatcher.this.uploadSectionLayer(meshData, RenderSection.this.getBuffer(renderType)));
                    compiledsection.hasBlocks.add(renderType);
                });
                //上传结果处理
                return Util.sequenceFailFast(list).handle((p_349887_, p_349888_) -> {
                    if (p_349888_ != null && !(p_349888_ instanceof CancellationException) && !(p_349888_ instanceof InterruptedException)) {
                        Minecraft.getInstance().delayCrash(CrashReport.forThrowable(p_349888_, "Rendering section"));
                    }

                    if (this.isCancelled.get()) {
                        return SectionRenderDispatcher.SectionTaskResult.CANCELLED;
                    } else {
                        RenderSection.this.setCompiled(compiledsection);
                        return SectionRenderDispatcher.SectionTaskResult.SUCCESSFUL;
                    }
                });
            }
        }
    }
}
```

这里我们核心来看看这个`compile`方法：

```java
public SectionCompiler.Results compile(SectionPos sectionPos, RenderChunkRegion region, VertexSorting vertexSorting, SectionBufferBuilderPack sectionBufferBuilderPack, List<net.neoforged.neoforge.client.event.AddSectionGeometryEvent.AdditionalSectionRenderer> additionalRenderers) {
    SectionCompiler.Results sectioncompiler$results = new SectionCompiler.Results();
    //获取区块切片的起始点与终止点 每个区块切片为标准区块(水平16*16)在竖直上以16为高度切分为的16^3立方体空间。
    BlockPos blockpos = sectionPos.origin();
    BlockPos blockpos1 = blockpos.offset(15, 15, 15);
    VisGraph visgraph = new VisGraph();//VisGraph用于计算章节可见面合计 使用bitset floodfill 用于判断可能的切片面透视 上面提到过了
    PoseStack posestack = new PoseStack();
    ModelBlockRenderer.enableCaching();//启用方块模型渲染缓存
    //这里的CHUNK_BUFFER_LAYERS是固定的，即ImmutableList.of(solid(), cutoutMipped(), cutout(), translucent(), tripwire())
    //也对应着我们在全渲染流程章节提到的
    Map<RenderType, BufferBuilder> map = new Reference2ObjectArrayMap<>(RenderType.chunkBufferLayers().size());
    RandomSource randomsource = RandomSource.create();

    //遍历所有方块
    for (BlockPos blockpos2 : BlockPos.betweenClosed(blockpos, blockpos1)) {
        BlockState blockstate = region.getBlockState(blockpos2);
        if (blockstate.isSolidRender(region, blockpos2)) {
            visgraph.setOpaque(blockpos2);//标记位置不可透视
        }

        //若为方块实体 检查是否需要渲染剪除 并分别记录
        if (blockstate.hasBlockEntity()) {
            BlockEntity blockentity = region.getBlockEntity(blockpos2);
            if (blockentity != null) {
                this.handleBlockEntity(sectioncompiler$results, blockentity);
            }
        }

        //获取流体状态 渲染流体流动效果
        FluidState fluidstate = blockstate.getFluidState();
        if (!fluidstate.isEmpty()) {
            RenderType rendertype = ItemBlockRenderTypes.getRenderLayer(fluidstate);
            BufferBuilder bufferbuilder = this.getOrBeginLayer(map, sectionBufferBuilderPack, rendertype);
            this.blockRenderer.renderLiquid(blockpos2, region, bufferbuilder, blockstate, fluidstate);
        }

        //渲染方块模型
        if (blockstate.getRenderShape() == RenderShape.MODEL) {
            var model = this.blockRenderer.getBlockModel(blockstate);
            var modelData = region.getModelData(blockpos2);
            modelData = model.getModelData(region, blockpos2, blockstate, modelData);
            randomsource.setSeed(blockstate.getSeed(blockpos2));
            for (RenderType rendertype2 : model.getRenderTypes(blockstate, randomsource, modelData)) {
                BufferBuilder bufferbuilder1 = this.getOrBeginLayer(map, sectionBufferBuilderPack, rendertype2);
                posestack.pushPose();
                posestack.translate(
                        (float) SectionPos.sectionRelative(blockpos2.getX()),
                        (float) SectionPos.sectionRelative(blockpos2.getY()),
                        (float) SectionPos.sectionRelative(blockpos2.getZ())
                );
                this.blockRenderer.renderBatched(blockstate, blockpos2, region, posestack, bufferbuilder1, true, randomsource, modelData, rendertype2);
                posestack.popPose();
            }
        }
    }
    //附加额外图形渲染事件
    ClientHooks.addAdditionalGeometry(
            additionalRenderers,
            type -> this.getOrBeginLayer(map, sectionBufferBuilderPack, type),
            region,
            posestack
    );

    //遍历存储的缓冲区构建器，写入网格数据
    for (Entry<RenderType, BufferBuilder> entry : map.entrySet()) {
        RenderType rendertype1 = entry.getKey();
        MeshData meshdata = entry.getValue().build();
        if (meshdata != null) {
            //对于半透明层进行额外的处理，重排以保证半透明内容的顺序为从后到前
            if (rendertype1 == RenderType.translucent()) {
                sectioncompiler$results.transparencyState = meshdata.sortQuads(sectionBufferBuilderPack.buffer(RenderType.translucent()), vertexSorting);
            }

            sectioncompiler$results.renderedLayers.put(rendertype1, meshdata);
        }
    }

    //清除回收数据
    ModelBlockRenderer.clearCache();
    sectioncompiler$results.visibilitySet = visgraph.resolve();
    return sectioncompiler$results;
}
```

## 透明层重排任务

透明层重排通常没那么重要，上面的代码已经提到，一般只会有离摄像机最近的至多15个区块切片在摄像机移动时执行重排。
重排有助于避免半透明层顺序错误导致的奇妙渲染错误。

```java
public CompletableFuture<SectionRenderDispatcher.SectionTaskResult> doTask(SectionBufferBuilderPack sectionBufferBuilderPack) {
    //和之前一样的一些取消处理器
    if (this.isCancelled.get()) {
        return CompletableFuture.completedFuture(SectionRenderDispatcher.SectionTaskResult.CANCELLED);
    } else if (!RenderSection.this.hasAllNeighbors()) {
        this.isCancelled.set(true);
        return CompletableFuture.completedFuture(SectionRenderDispatcher.SectionTaskResult.CANCELLED);
    } else if (this.isCancelled.get()) {
        return CompletableFuture.completedFuture(SectionRenderDispatcher.SectionTaskResult.CANCELLED);
    } else {
        MeshData.SortState meshdata$sortstate = this.compiledSection.transparencyState;
        //如果有已排序过的半透明层内容且区块切片内有半透明内容
        if (meshdata$sortstate != null && !this.compiledSection.isEmpty(RenderType.translucent())) {
            //创建顶点排序缓冲器
            VertexSorting vertexsorting = RenderSection.this.createVertexSorting();
            ByteBufferBuilder.Result bytebufferbuilder$result = meshdata$sortstate.buildSortedIndexBuffer(
                    sectionBufferBuilderPack.buffer(RenderType.translucent()), vertexsorting
            );
            if (bytebufferbuilder$result == null) {
                return CompletableFuture.completedFuture(SectionRenderDispatcher.SectionTaskResult.CANCELLED);
            } else if (this.isCancelled.get()) {//又检查一次取消
                bytebufferbuilder$result.close();
                return CompletableFuture.completedFuture(SectionRenderDispatcher.SectionTaskResult.CANCELLED);
            } else {
                //最核心的地方在这里
                CompletableFuture<SectionRenderDispatcher.SectionTaskResult> completablefuture = SectionRenderDispatcher.this.uploadSectionIndexBuffer(
                        bytebufferbuilder$result, RenderSection.this.getBuffer(RenderType.translucent())
                ).thenApply(p_294714_ -> SectionRenderDispatcher.SectionTaskResult.CANCELLED);
                return completablefuture.handle(//提交任务
                        (p_295896_, p_295826_) -> {
                            if (p_295826_ != null && !(p_295826_ instanceof CancellationException) && !(p_295826_ instanceof InterruptedException)) {
                                Minecraft.getInstance().delayCrash(CrashReport.forThrowable(p_295826_, "Rendering section"));
                            }

                            return this.isCancelled.get()
                                    ? SectionRenderDispatcher.SectionTaskResult.CANCELLED
                                    : SectionRenderDispatcher.SectionTaskResult.SUCCESSFUL;
                        }
                );
            }
        } else {
            return CompletableFuture.completedFuture(SectionRenderDispatcher.SectionTaskResult.CANCELLED);
        }
    }
}
```

`SectionRenderDispatcher.this.uploadSectionIndexBuffer`这地方有点意思，可以拉出来单说一下怎么重排的

```java
public static record SortState(Vector3f[] centroids, VertexFormat.IndexType indexType) {
    @Nullable
    public ByteBufferBuilder.Result buildSortedIndexBuffer(ByteBufferBuilder bufferBuilder, VertexSorting sorting) {
        //重排平面数据以改变渲染顺序，防止深度问题。
        int[] aint = sorting.sort(this.centroids);
        //为生成的索引数据申请足量的内存空间
        //每个aint写入两个三角形 也就是共计6个顶点索引
        long i = bufferBuilder.reserve(aint.length * 6 * this.indexType.bytes);
        IntConsumer intconsumer = this.indexWriter(i, this.indexType);

        //这里的012 230正好是一个四边形拆为两个三角形的顶点编号，将四边形转换为两个三角形写入
        for (int j : aint) {
            intconsumer.accept(j * 4 + 0);
            intconsumer.accept(j * 4 + 1);
            intconsumer.accept(j * 4 + 2);
            intconsumer.accept(j * 4 + 2);
            intconsumer.accept(j * 4 + 3);
            intconsumer.accept(j * 4 + 0);
        }

        return bufferBuilder.build();
    }
}
```

## 流程栈追踪

```
-Main#main L230
-Minecraft#run L813
-Minecraft#runTick L1201
-GameRenderer#render L1030

rebuild task created by:
    -LevelRenderer#renderLevel L970
    compile sync:
        -LevelRenderer#compileSections L1992
        -SectionRenderDispatcher#rebuildSectionSync L179
        -SectionRenderDispatcher.RenderSection#compileSync L477
        -DOTASK SectionRenderDispatcher.RenderSection#compileSync L478
    rebuild async:
        -LevelRenderer#compileSections L2006
        -SectionRenderDispatcher.RenderSection#rebuildSectionAsync L458
        -SCHEDULE SectionRenderDispatcher.RenderSection#rebuildSectionAsync L459
resort transparency task created by:
    -LevelRenderer#renderLevel L972 or L974 or L976 or L1184 or L1186 or L1203 or L1207
    -LevelRenderer#renderSectionLayer L1308
    -SectionRenderDispatcher.RenderSection#resortTransparency L418
    -SCHEDULE SectionRenderDispatcher.RenderSection#resortTransparency L421
    -execute SCHEDULE
    -SectionRenderDispatcher#schedule L197
    -DOTASK SectionRenderDispatcher#runTask L102

-RenderSection.RebuildTask#doTask L565
```