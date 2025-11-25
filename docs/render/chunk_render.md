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

[//TODO]

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
INIT SectionCompiler#compile L52

区块任务分为两种类型：

- 层重排任务，一般是因摄像头移动导致，需要重新计算各种渲染类型的方块层顺序，剔除不可见面等。
- 重建任务，一般是方块被更改而导致，需要完整的重新烘培整个区块的模型。

区块任务的执行也分为三种：

- 同步编译：对于近距离区块，立刻执行区块重建任务，以保证最快的玩家交互更改。
- 异步高优先级编译：对于中距离区块或者层重排任务，为高优先级编译任务，会在异步的执行中优先执行。
- 异步低优先级编译：对于远距离区块，为低优先级编译任务，通常不具有紧急信息要素，只会在没有高优先级任务时被执行。

