---
name: diagram-component
description: 画图组件（第三个 loader 行）的实测结论：中立模型与两个记法适配器、图自带底色、深浅色与配色方案、右栏白板的两段注册与轮询、以及为什么它与工具卡片的激活问题互不牵连
metadata:
  type: design
---

# 画图组件

> 上级：[INDEX-design.md](../INDEX-design.md)　·　什么时候读：改渲染器、加一种记法、动白板或配色之前

## 它是第三个组件，不是工具的一部分

`cordis.patch.yml` 现在是三行，各带自己的开关：

## 三个工具，一文件一个

| 工具 | 文件 | 做什么 |
|---|---|---|
| `diagram_render` | `src/diagram-render-tool.ts` | 源码 → SVG，可写文件、选配色 |
| `diagram_review` | `src/diagram-review-tool.ts` | 结构预算（宽 / 深 / 节点数），带 `measured` |
| `diagram_diff` | `src/diagram-diff-tool.ts` | 两份结构差异（增删 / 改名 / 换父 / 换归属） |

拆开不只是为了整齐：**文档生成器按 `*-tool` 约定发现工具**。堆在 `src/diagram.ts` 里时，`docs/routing-map.md`
里找不到这三个工具；拆开后生成器扫到 `lib/diagram.js` 这一行，路由地图自动带上它们。

## 层级：结构 + 规则 + 交互

- **结构**：`DiagramGroup.parent` 由解析器填（它知道边界写在哪一层），布局只查表；手写模型没填时才退回成员集合推断，并有父不存在 / 成环 / 多组声明 三种守卫。
- **规则**：`budget.ts` 判组宽、嵌套深度、节点总数；`measured` 与 `findings` 分开，避免「没东西可查」被读成「查过且干净」。
- **交互**：`collapse.ts` 把折叠做成**模型变换**（组 → 一个盒子、边改指、内部边消失、父组收编），白板只负责点一下并把折叠集合交给 `render`。
- **差异**：`diff.ts` 只判「变没变」，不判「好不好」；两边都空判 `fail`，因为空报告会和「无变化」长得一样。

## 绘制与布局分开

`paint.ts` 曾同时管「盒子放哪」和「线怎么连」（436 行）。现在：

- `place.ts`：按固定顺序组合分层流水线（断环 → 分层 → 哑节点 → 排序 → 坐标 → 通道），外加分组树、分量切分与包装；
- `channels.ts`：两个 gap 里**车道**的 x 与**走廊**的 y——同一 gap 的长边不共用 x（左起按哑节点在排序里的位置），
  同一 gap 的横向走线不共用高度；
- `paint.ts`：走线、标签、题注，只从 `place` 拿坐标。

收益是可断言的：改走线挪不动盒子，改嵌套挪不动线。

**车道归路由所有。** `coords.ts` 不再为了躲车道去移动盒子（盒子停在它连的那些盒子的均值上，哑节点不算邻居），
车道自己让到空档里；端口沿一条边做单调拟合，长边要它车道那一侧的角。所以「车道不穿盒子」这条不变量在
`tests/channels` 里断言，不在 `tests/coords`。

## 合流干线（fan-in trunk）

一个盒子被四条关系指着时，原来的画法是四个端口加四条线：每条线都对，整幅图是错的——读者按端口数箭头，图读成梳子。
ELK 的 *Merge Edges*（junction points）与 Graphviz 的 `concentrate` 解的是同一件事：目标外一条直线段，分支各自接到它上面，
再共用一个入口。

**分工**：`trunk.ts` 只判「哪些端点能合、干线在哪、共享入口取谁」，是纯几何，可脱离画布断言；`paint.ts` 负责画。
顺序是刻意的：端口先按原规则摆好（这一步与合流无关），合流判据读**摆好的端口**，所以不合流的图逐字节不变。

**规则**（每条都有一条用例，且都在 planner 上单独可判）：

- 同目标、同进入侧。不同侧是不同方向，换轴的干线就是两条干线。
- 端点必须朝着干线：干线在源盒外侧也在目标外侧，否则分支要先拐一次，正好省掉它本该省的弯。
- 源不同且至少三条。两条合起来就是一条粗线；一对一的关系本来就是两条线（`MULTI_EDGE_SPACING`），
  同源的两条边会被「源必须不同」整对剔掉，所以多边规则不会被合流推翻。
- `arrow` 相同（都没声明算相同）。组合画到关联的干线上，等于把两个不同的陈述读成一个。按 arrow 分组，
  三条关联照合，那条组合自己走。
- 只处理有 run 的边：长边有自己的车道（`channels.ts`），不参与。边界（组矩形）不是干线目标。
- 干线与每条分支的直落都不许穿盒子；两条干线不许共线（否则两个无关目标读成一条总线）。

**共享入口取「本来最直的那条分支的端口」。** 未合流时 `k` 条直落、`n` 条边的弯数是 `2(n−k)`；合流后是 `2(n−1)`。
取最直的那条做入口，`k=1` 时弯数不增；只有本来就 ≥2 条直落时才会每条多一个弯。基准的 `fanin` fixture（四源一目标）
因此是弯数 6→6、crossings 0→0、目标端口 4→1、`trunkGroups` 0→1；长度 436→549，是横向距离从两处拐弯搬进一条直线段，
不是多画了线。

**连接点必须有。** 每个分支与干线相交处生成一个 `junction` 形状（`<circle r="2.5">`，线色），带 `trunk` 组 id：
没有它，两条垂直相交的线读成「断掉的一条」，读数也数不出几组合流（基准的 `trunkGroups` / `portsOnTarget` 两列就是数它）。

**不变的东西**：每个合流边仍带自己的箭头与标签（箭头因同一 arrow 规则而重合在共享入口，仍各写一个），
布局指纹（`bench` 的 fingerprint）在其余 fixture 上不变。

## 一份模型

`viewmodel.ts` 曾经自己声明一套 `Diagram` / `DiagramNode` / `DiagramEdge`，与 `model.ts` 重复；TypeScript 的
结构类型让它们编译期看起来兼容，于是**谁都不报错**。现在只有 `model.ts` 一份，适配器只做「报告 → 模型」。

| 行 | 内容 | 开关 |
|---|---|---|
| `dsh-model-everything` | 工具与技能 | 行本身 |
| `dsh-model-everything-gate` | 会话开头路由注入 | `config.enabled`（live） |
| `dsh-model-everything-diagram` | 画图（`diagram_render`） | `config.enabled`（live） |

画图**不带引擎**：关掉前两行，它照样能画。这是「脱离重型工具独立提供渲染能力」的落点。

## 一个中立模型，N 个适配器

```ts
Diagram = { kind: 'machine' | 'graph' | 'none', init?, title, nodes[], edges[], groups?, caption }
```

- `from-report.ts`：验证报告 → 图（卡片用）
- `from-mermaid.ts` / `from-plantuml.ts`：源码 → 图（白板与工具用）
- 排版（`layout`）、绘制（`paint`）、输出（`svg`）**完全不知道记法存在**——加第四种记法只写一个解析器

**拒绝要带行号**。`sequenceDiagram`、`actor`、`click`、`classDef` 一律拒绝并报 `line N: …`，因为悄悄丢掉生命线的时序图看起来是完整的，实际不是。这条边界本身有用例。

## 图自带底色

SVG 的第一个元素必须是覆盖整个 `viewBox` 的背景矩形：

```js
<rect x="0" y="0" width="W" height="H" fill="#ffffff" />
```

理由不是审美：盒子是 `fill="transparent"`，若画布也不带底，整幅图就依赖外层容器的底色。一旦外层是深色、半透明或带滤镜（wallpaper 类插件），浅色线条直接消失。**对比度必须随标记走，而不是随容器走**。

同一条规则也适用于容器：白板的 `background` 取自 `render()` 返回的 `colours.background`，而不是自己猜。

## 深浅色与配色

宿主把主题发布成私有 CSS 变量（`--dsh-*`），名字会漂，**不要按名字取色**。唯一不会漂的事实是渲染出来的背景亮度：

```ts
themeMode()  // getComputedStyle(body).backgroundColor → Rec.601 luma < 0.5 → 'dark'
             // 读不到就回落 'light'，绝不抛错
```

四套方案，**方案自己声明要不要跟随深浅色**：

| 方案 | light | dark |
|---|---|---|
| `default` | 中性灰 | 有 |
| `github` | Primer 的真实色值 | 有 |
| `high-contrast` | 纯黑白 | **故意不跟随** |
| `print` | 全灰阶 | **故意不跟随** |

选择器列 `schemeNames()`，加方案不用改客户端。

## 右栏白板：两段注册 + 轮询

```js
ctx.slots.inject('sidebar.right.pane.tab', cb)      // 座位存在 = 有官方右栏
cb:
  tabs = ctx.get('sidebarRightTabs')                // 可选服务
  tabs.register({ id, kind, keepMounted: true, title, guide })
  ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id }, Whiteboard)
```

**必须轮询**（250ms，40 次上限）。宿主先组装座位、后组装服务，单次 `ctx.get` 是竞态——实测表现为「标签有时在、有时消失」。轮询要可注入调度器，否则竞态测试只能等真实定时器，变成 flaky。

## 与工具卡片互不牵连

白板只读自己的文本框，不读任何工具结果，所以卡片那条线的未解问题（`active:false`）不影响它。这也说明**客户端半本身是能加载的**——右栏标签出现即为证据；问题只在 `tool.call.toolview` 那一个注册上。

## 三个容器的进度

| 容器 | 状态 | 依赖 |
|---|---|---|
| 文件导出（`diagram_render` 的 `out`） | 可用 | 无 |
| 右栏白板 | 可用 | 客户端半（已验证） |
| 对话内嵌卡片 | 未验证 | `tool.call.toolview` 的激活 |
| 全屏 | 未做 | 白板 + `sidebarRight.openTab(id, { fullscreen: true })` |
