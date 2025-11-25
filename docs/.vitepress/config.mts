import { defineConfig } from "vitepress";
import mdItCustomAttrs from "markdown-it-custom-attrs";
import { prettyLinkPlugin } from "./theme/plugins/prettyLink";
import { prettyList } from "./theme/datas/prettyLinks";
import path from 'path'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'
// https://vitepress.dev/reference/site-config
export default defineConfig({
  head: [
    ["link", { rel: "icon", type: "image/x-icon", href: "/icon/neo.ico" }],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://cdn.jsdelivr.net/npm/@fancyapps/ui/dist/fancybox.css",
      },
    ],
    [
      "script",
      {
        src: "https://cdn.jsdelivr.net/npm/@fancyapps/ui@4.0/dist/fancybox.umd.js",
      },
    ],
  ],
  ignoreDeadLinks: true,
  lang: "zh-CN",
  title: "ArkdustTutorials",
  description:
    "The Tutorials Of Minecraft Neoforge1.20.4 , Arkdust mod and even more",
  themeConfig: {
    logo: "/icon/neo.svg",
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "主页", link: "/" },
      { text: "快速开始", link: "/introduction" },
      {
        text: "教程",
        items: [
          { text: "基础学", link: "/base/" },
          { text: "数据学", link: "/data/" },
          { text: "额外学", link: "/extra/"},
          { text: "经验学", link: "/experience/"}
        ],
      },
      { text: "ModernUI", link: "/mui/" },
      { text: "GeckoLib", link: "/geckolib/"},
      { text: "关于", link: "/about/team" },
      { text: "加入我们", link: "/about/pr" },
    ],

    sidebar: [
      {
        text: "教程",
        items: [
          { text: "概述", link: "/introduction" },
          { text: "开发环境配置", link: "/environment" },
          {
            text: "基础学", link: "/base/",
            items: [
              { text: "模组准备", link: "/base/prepare" },
              { text: "注册 基础*", link: "/base/registration" },
              { text: "物品 基础", link: "/base/item" },
              { text: "方块 基础", link: "/base/block" },
            ],
          },
          {
            text: "数据学", link: "/data/",
            items: [
              { text: "自定义数据包", link: "/data/custompacket" },
              { text: "编解码器*", link: "/data/codec" },
              { text: "自定义注册种类", link: "/data/custom_registry" },
            ]
          },
          {text: "渲染学", link: "/render/",
            items: [
              {text: "纹理图集", link: "/render/texture_atlas"},
              {text: "原生图片*", link: "/render/native_image"},
              {text: "物品渲染-变色", link: "/render/item/color"},
              {text: "物品渲染-BEWLR", link: "/render/item/bewlr"},
              {text: "物品渲染-已烘培模型", link: "/render/item/baked_model"},
              {text: "渲染目标", link: "/render/render_target"},
              {text: "渲染流程*", link: "/render/game_render_process"},
            ]
          },
          {text: "非生物实体学", link: "/unliving/",
            items: [
              {text: "容器与物品处理", link: "/unliving/container"},
              {text: "战利品表", link: "/unliving/loottable"},
            ]
          },
          {text: "世界生成学", link: "/worldgen/",
            items: [
              {text: "序", link: "/worldgen/start"},
              {text: "群系源", link: "/worldgen/biome_source"},
              {text: "密度函数", link: "/worldgen/density_func"},
              {text: "表面规则", link: "/worldgen/surface_rule"},
            ]
          },
          {
            text: "额外学", link: "/extra/",
            items: [
              {text: "多模块", link: "/extra/multi_module",},
              {text: "Architectury", link: "/extra/arch",},
            ],
          },
          {
            text: "经验学", link: "/experience/", collapsed: true,
            items: [
                {text: "无实体碰撞", link: "/experience/no_entity_collision"},
                {text: "完美隐身", link: "/experience/perfect_invisible"},
                {text: "额外模型注册", link: "/experience/extra_model"},
                {text: "菜单实体渲染", link: "/experience/title_screen_entity"}
            ]
          }
        ],
      },
      {
        text: "ModernUI使用笔记",
        link: "/mui/",
        collapsed: true,
        items: [
          { text: "将Mui加载进项目依赖", link: "/mui/preparation" },
          { text: "在mc中使用Mui的UI系统", link: "/mui/demoscreen" },
          {
            text: "Mui基础学",
            link: "/mui/base/",
            items: [
              { text: "片段(Fragment)", link: "/mui/base/fragment" },
              { text: "视图与文本视图(View/TextView)", link: "/mui/base/view" },
              { text: "视图组(ViewGroup)", link: "/mui/base/viewgroup" },
              { text: "渲染(Render)", link: "/mui/base/render" },
              { text: "动画(Animation)", link: "/mui/base/animation" },
              { text: "格式化文本(Spannable)", link: "/mui/base/spannable" },
            ],
          },
        ],
      },
      {
        text: "GeckoLib使用笔记",
        link: "/geckolib/",
        collapsed: true,
        items: [
        ]
      },
      {
        text: "关于",
        link: "/about/team",
        items:[
          {
            text: "加入我们",
            link: "/about/pr",
          },
          {
            text: "文档自定义控件",
            items:[
              { text: "现代化超链接", link: "/components/modernurl" },
              { text: "MC图标", link: "/components/mcicon" },
              { text: "顶部题外话", link: "/components/subtitle" },
              { text: "尾部作者栏", link: "/components/author" },
              { text: "更好的超链接", link: "/components/prettylink" },
              { text: "多版本", link: "/components/versions" },
            ]
          }
        ]
      },
      
    ],
    returnToTopLabel: "返回顶部",
    sidebarMenuLabel: "目录",
    outline: {
      label: "当前页大纲",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/kitUIN/ArkdustTutorials" },
    ],
    editLink: {
      pattern:
        "https://github.com/kitUIN/ArkdustTutorials/edit/master/docs/:path",
      text: "在Github上编辑该页",
    },
    lastUpdated: {
      text: "上次更新时间",
    },
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: "搜索文档",
                buttonAriaLabel: "搜索文档",
              },
              modal: {
                noResultsText: "无法找到相关结果",
                resetButtonTitle: "清除查询条件",
                footer: {
                  selectText: "选择",
                  navigateText: "切换",
                },
              },
            },
          },
        },
      },
    },
    docFooter: {
      prev: "上一页",
      next: "下一页",
    },
  },
  lastUpdated: true,
  markdown: {
    image: {
      // 默认禁用图片懒加载
      lazyLoading: true,
    },
    config: (md) => {
      // use more markdown-it plugins!
      md.use(mdItCustomAttrs, "image", {
        "data-fancybox": "gallery",
      });
      md.use(prettyLinkPlugin, prettyList);
    },
  },
  vite: {
    plugins:[
      createSvgIconsPlugin({
        iconDirs: [path.resolve(process.cwd(), "docs/.vitepress/svgs")], // icon存放的目录
        symbolId: "icon-[name]", // symbol的id
        inject: "body-last", // 插入的位置
        customDomId: "__svg__icons__dom__" // svg的id
      }),
    ]
  }
});