-Main#main L230
-Minecraft#run L813
-Minecraft#runTick L1201
-GameRenderer#render L1030

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
        M 水平面向镜头
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
    M frustumMatrix
    S (12,1,12)
    T (-uvOffsetX, verticalOffset, -uvOffsetZ)
    POSE LevelRenderer#renderClouds L1782 用于渲染云
POP LevelRenderer#renderClouds L1789

# Item In Hand Stack

-GameRenderer#renderLevel L1283
INIT GameRenderer#renderItemInHand L939
PUSH GameRenderer#renderItemInHand L940
    M projectionMatrix.invert(new Matrix4f())
    GameRenderer#renderItemInHand L945
    M Z(40 - 8000 / (min(20,living.deathTime + partialTicks)+200)) if living.dying
    M Y(-living.getHurtDir())
    M Z(((living.hurtTime - partialTicks) / living.hurtDuration) ^ 4 / PI * 14.0 * damageTiltStrength)
    M Y(living.getHurtDir())
    CONST
        float dist = -(player.walkDist + (player.walkDist - player.walkDistO) * partialTicks) * PI;
    T (sin(dist) * lerp bob * 0.5, - abs(cos(dist) * lerp bob), 0)
    M Z(Mth.sin(dist) * lerp bob * 3.0F)
    M X(Math.abs(Mth.cos(dist - 0.2) * lerp bob) * 5)
    GameRenderer#renderItemInHand L957
    M X((playerEntity.getViewXRot(partialTicks) - lerp xBob) * 0.1F)
    M Y((playerEntity.getViewYRot(partialTicks) - lerp yBob) * 0.1F)
    EVENT RenderHandEvent(InteractionHand.MAIN_HAND)
    ItemInHandRenderer#renderHandsWithItems L341 or L348
    CONST int i = humanoidarm == HumanoidArm.RIGHT ? 1 : -1
    PUSH ItemInHandRenderer#renderArmWithItem L402
        IF stack.isEmpty()
            ItemInHandRenderer#renderArmWithItem L405
            CONST
                float f1 = sqrt(swingProgress)
            T (i * (-0.3 * sin(f1 * PI) + 0.64+), 0.4 * sin(f1 * 2PI), -0.4 * sin(swingProgress * PI) -0.72-)
            M Y(i * 45)
            M Y(i * sin(f1 * PI) * 70)
            M Z(i * sin(swingProgress ^ 2 * PI) * -20)
            T (-i, 3.6, 3.5)
            M Z(i * 120)
            M X(200)
            M X(i * -135)
            T (f * 5.6, 0, 0)
            ItemInHandRenderer#renderPlayerArm L265 or L267
            EVENT RenderArmEvent HumanoidArm.RIGHT or HumanoidArm.LEFT
            PlayerRenderer#renderHand L215
            ModelPart#render L107
            PUSH ModelPart#render L113
                ModelPart#render L114
                T (x, y, z)/16
                M rotationZYX(zRot, yRot, xRot)
                S (xScale, yScale, zScale)
                POSE ModelPart#render L116 渲染编译的模型
                ModelPart#render L120 for Children ModelPart
            POP ModelPart#render L123
            PlayerRenderer#renderHand L217
        IF MapItem
            IF TwoHandedMap
                T (0, -0.1 * sin(swingProgress * PI), -0.4 * sin(sqrt(swingProgress) * PI))
                T (0, 0.04 + -1.2 * equippedProgress + -0.5 * calculateMapTilt(pitch), -0.72)
                M X(calculateMapTilt(pitch) * -85)
                PUSH ItemInHandRenderer#renderTwoHandedMap L213
                    M Y(90)
                    ItemInHandRenderer#renderTwoHandedMap L214 and L215
                    PUSH ItemInHandRenderer#renderMapHand L162
                        M Y(92)
                        M X(45)
                        M Z((1 and -1) * -41)
                        T (0.3 and -0.3, -1.1, 0.45)
                        ItemInHandRenderer#renderMapHand L169 and L171
                        EVENT RenderArmEvent HumanoidArm.RIGHT and HumanoidArm.LEFT
                        COPY 111 - 121
                    POP ItemInHandRenderer#renderMapHand L174
                POP ItemInHandRenderer#renderTwoHandedMap L216
                M X(20 * sin(sqrt(swingProgress) * PI))
                S 2
                ItemInHandRenderer#renderTwoHandedMap L222
                M Y(180)
                M Z(180)
                S 0.38
                T (-0.5, -0.5, 0)
                S 0.0078125
                POSE ItemInHandRenderer#renderMap L234 渲染地图
                ItemInHandRenderer#renderMap L240 渲染地图
            ELSE
                T (i * 0.125, -0.125, 0)
                PUSH ItemInHandRenderer#renderOneHandedMap L183
                    M Z(i * 10)
                    ItemInHandRenderer#renderOneHandedMap L185
                    COPY 97 - 121
                POP ItemInHandRenderer#renderOneHandedMap L186
                PUSH ItemInHandRenderer#renderOneHandedMap L189
                    T (i * 0.51, -0.08 + -1.2 * equippedProgress, -0.75)
                    CONST float f2 = sin(sqrt(swingProgress) * PI)
                    T (-0.5 * i * f2, 0.4 * sin(sqrt(swingProgress) * 2PI) - 0.3 * f2, -0.3 * sin(swingProgress * PI))
                    M X(45 * f2)
                    M Y(-30 * i * f2)
                    ItemInHandRenderer#renderOneHandedMap L199
                    COPY 143 - 149
                POP ItemInHandRenderer#renderOneHandedMap L200
        IF CrossbowItem
            IF 玩家正在拉弓
                ItemInHandRenderer#renderArmWithItem L418
                T (i * 0.56, -0.52 + -0.6 * equippedProgress, -0.72)
                T (i * -0.4785682, -0.094387, 0.05732531)
                M X(-11.935)
                M Y(65.3 * i)
                M Z(-9.785 * i)
                CONST
                    float f9 = stack.getUseDuration(.) - player.getUseItemRemainingTicks + partialTicks - 1
                    float f13 = min(1, f9 / CrossbowItem.getChargeDuration(.))
                IF f13 > 0.1
                    T (0, sin(1.3 * f9 - 0.13) * (f13 - 0.1) * 0.004, 0)
                T (0, 0, 0.04 * f13)
                S (1,1,1 + 0.2 * f13)
                M Y(45 * i)
            ELSE
                T (i * -0.4 * sin(sqrt(swingProgress) * PI), 0.2 * sin(sqrt(swingProgress) * 2PI), -0.2 * sin(swingProgress * PI))
                ItemInHandRenderer#renderArmWithItem L444
                T (i * 0.56, -0.52 + -0.6 * equippedProgress, -0.72)
                ItemInHandRenderer#renderArmWithItem L445
                M Y(i * (45 + -20 * sin(swingProgress ^ 2 * PI)))
                M Z(i * -20 * sin(sqrt(swingProgress) * PI))
                M X(-80 * sin(sqrt(swingProgress) * PI))
                M Y(-45 * i)
                IF CrossbowItem.isCharged(.) && swingProgress < 0.001 && hand == InteractionHand.MAIN_HAND
                    T (-0.641864 * i, 0, 0)
                    M Y(10 * i)
            ItemInHandRenderer#renderArmWithItem L452
            ItemInHandRenderer#renderItem L136
            ItemRenderer#renderStatic L255
            PUSH ItemRenderer#render L113
                ItemRenderer#render L123
                T -0.5
                EXECUTE
                    POSE ItemRenderer#render L138 获取物品渲染位置变换
                    ItemRenderer#render L152
                OR
                    ItemRenderer#render L156
            POP ItemRenderer#render L159
        ELSE
            ItemInHandRenderer#renderArmWithItem L463
            IClientItemExtensions#applyForgeHandTransform 附加自定义变换
            IF 玩家正在使用物品
                SWITCH stack.getUseAnimation() CASE NONE or BLOCK:
                    ItemInHandRenderer#renderArmWithItem L468 or L476
                    COPY 185
                CASE EAT or DRINK:
                    ItemInHandRenderer#renderArmWithItem L472
                    CONST
                        float f = player.getUseItemRemainingTicks() - partialTick + 1
                        float f3 = 1 - pow(f / stack.getUseDuration(.), 27)
                    IF f / stack.getUseDuration(.) < 0.8
                        T (0, abs(cos(f / 4 * PI) * 0.1), 0)
                    T (0.6 * f * f3, -0.5 * f3, 0)
                    M Y(90 * i * f3)
                    M X(10 * f3)
                    M Z(30 * i * f3)
                    ItemInHandRenderer#renderArmWithItem L473
                    COPY 185
                CASE BOW:
                    ItemInHandRenderer#renderArmWithItem L479
                    COPY 185
                    T (i * -0.2785682. 0.18344387, 0.13731531)
                    M X(-13.935)
                    M Y(35.3 * i)
                    M Z(-9.785 * i)
                    CONST
                        float f8 = stack.getUseDuration(.) - player.getUseItemRemainingTicks + partialTicks - 1
                        float f12 = min(3, (f8 / 20) ^ 2 + (f8 / 20) * 2) / 3
                    IF f12 > 0.1
                        T (0, 0.004 * sin((f8 - 0.1) * 1.3 * (f12 - 0.1)), 0)
                    T (0, 0, f12)
                    S (1, 1, 1 + 0.2 * f12)
                    M Y(45 * i)
                CASE SPEAR:
                    ItemInHandRenderer#renderArmWithItem L503
                    COPY 185
                    T (-0.5 * i, 0.7, 0.1)
                    M X(-55)
                    M Y(35.3 * i)
                    M Z(-9.785 * i)
                    CONST
                        float f7 = stack.getUseDuration(.) - player.getUseItemRemainingTicks + partialTicks - 1
                        float f11 = sin(1, f7 / 10)
                    IF f11 > 0.1
                        T (0, 0.004 * sin((f7 - 0.1) * 1.3) * (f11 - 0.1), 0)
                        T (0, 0, 0.2 * f11)
                        S (1, 1, 1 + 0.2 * f11)
                        M Y(45 * i)
                CASE BRUSH:
                    ItemInHandRenderer#renderArmWithItem L526
                    ItemInHandRenderer#applyBrushTransform L288
                    COPY 185
                    CONST float f7 = -15 + 75 * cos(2PI * (1 - (player.getUseItemRemainingTicks() % 10 - partialTick + 1) / 10))
                    IF arm != HumanoidArm.RIGHT
                        T (0.1, 0.83, 0.35)
                        M X(-80)
                        M Y(-90)
                        M X(f7)
                        T (-0.3, 0.22, 0.35)
                    ELSE
                        T (-0.25, 0.22, 0.35)
                        M X(-80)
                        M Y(-90)
                        M Z(0)
                        M X(f7)
            IF player.isAutoSpinAttack()
                ItemInHandRenderer#renderArmWithItem L529
                COPY 185
                T (-0.4 * i, 0.8, 0.3)
                M Y(65 * i)
                M Z(-85 * i)
            ELSE 
                T (i * -0.4 * sin(sqrt(swingProgress) * PI), 0.2 *sin(sqrt(swingProgress) * 2PI), -0.2 * sin(swingProgress * PI))
                ItemInHandRenderer#renderArmWithItem L540
                COPY 185
                ItemInHandRenderer#renderArmWithItem L541
                COPY 212 - 215
        ItemInHandRenderer#renderArmWithItem L544
        COPY 195 - 205
    POP ItemInHandRenderer#renderArmWithItem L555
POP GameRenderer#renderItemInHand L969

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
PUSH SectionCompiler#compile L84
    T SectionPos.sectionRelative(blockpos)
    SectionCompiler#compile L90
    BlockRenderDispatcher#renderBatched L87
    