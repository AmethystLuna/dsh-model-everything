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
