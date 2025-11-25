-Main#main L230
-Minecraft#run L813
-Minecraft#runTick L1201
-GameRenderer#render L1030

# Chunk Compile Stack

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
INIT SectionCompiler#compile L52

# Main Frame Stack

-GameRenderer#renderLevel L1277
INIT LevelRenderer#renderLevel L1006
LevelRenderer#renderLevel L1041
LevelRenderer#renderEntity L1267
PUSH EntityRenderDispatcher#render L160
    T entityPos - camPos + entityRenderer.getRenderOffset
    EntityRenderDispatcher#render L162
    (交由实体渲染器自行渲染)
    PUSH EntityRenderer#renderLeash L106
        T 牵引绳索的实体相对牵引起始点坐标
        POSE EntityRenderDispatcher#renderalLeash L374 渲染实体绳索牵引
    POP EntityRenderer#renderLeash L140
    EntityRenderDispatcher#render L164
    PUSH EntityRenderDispatcher#RenderFlame L312
        S entity.getBbWidth() * 1.4F
        mulPose 水平面向镜头
        T (0,0,0.3F - (float)((int)entity.getBbHeight() / f / entity.getBbWidth() * 1.4F) * 0.02F)
        POSE EntityRenderDispatcher#renderFlame L325 渲染生物着火效果
    POP EntityRenderDispatcher#renderFlame L347
    T -entityRenderer.getRenderOffset
    EntityRenderDispatcher#render L174
    POSE EntityRenderDispatcher#renderShadow L374 渲染实体阴影
    EntityRenderDispatcher#render L180
    EntityRenderDispatcher#renderHitbox L227
    PUSH EntityRenderDispatcher#renderHitbox L234 for MultiPartEntity.getParts()
        T lerp EntityPos
        EntityRenderDispatcher#renderHitbox L239
    POP EntityRenderDispatcher#renderHitbox L248
    EntityRenderDispatcher#renderHitbox L254
    EntityRenderDispatcher#renderHitbox L275
    EntityRenderDispatcher#renderHitbox L291
POP EntityRenderDispatcher#render L183
CHECK LevelRender#renderLevel L1047
EVENT DispatchRenderStageEvent(Stage.AFTER_ENTITIES)

PUSH LevelRender#renderLevel L1062 for RenderableBlockEntities
    T blockPos - camPos
    POSE LevelRender#renderLevel L1068 用于附加方块破坏纹理效果至源顶点消费器
    LevelRender#renderLevel L1082 (交由方块实体自行进行渲染)
POP LevelRender#renderLevel L1083
PUSH LevelRender#renderLevel L1092 for RenderableGlobalBlockEntity
    T blockPos - camPos
    LevelRender#renderLevel L1097 (交由全局方块实体自行进行渲染)
POP LevelRender#renderLevel L1098
CHECK LevelRender#renderLevel L1102
EVENT DispatchRenderStageEvent(Stage.AFTER_BLOCK_ENTITIES)

PUSH LevelRender#renderLevel L1136 for DestructionBlocks
    T blockPos - camPos
    LevelRender#renderLevel L1138 (用于渲染方块表面破坏纹理)
POP LevelRender#renderLevel L1146
CHECK LevelRender#renderLevel L1151
EVENT RenderHighlightEvent.Block or RenderHighlightEvent.ENTITY
LevelRender#renderLevel L1160
EVENT DispatchRenderStageEvent(Stage.AFTER_PARTICLES)

LevelRender#renderLevel L1219
LevelRenderer#renderClouds L1724
PUSH LevelRenderer#renderClouds L1770
    mulPose frustumMatrix
    S (12,1,12)
    T (-uvOffsetX, verticalOffset, -uvOffsetZ)
    POSE LevelRenderer#renderClouds L1782 用于渲染云
POP LevelRenderer#renderClouds L1789