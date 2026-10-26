---
name: client-rendering
description: 客户端渲染的通道已实测——槽位 tool.call.toolview 按工具名接管卡片、客户端半是裸 JS 工厂、props 契约、打包与 100% 路径覆盖的模块划分
metadata:
  type: design
---

# 客户端渲染通道

> 上级：[INDEX-design.md](../INDEX-design.md)　·　什么时候读：写渲染器、加客户端半、或怀疑「插件能不能画」之前

## 结论：能画，按工具名接管卡片

一个普通包即可在会话卡片里画 SVG，**不改宿主、不重编前端、不需要重启页面**。实测证据：安装后客户端槽位占用表出现

```json
{ "registrant": "Gb", "key": "model_verify", "id": "card-probe", "active": true }
```

卸载后该行消失。两次都在几秒内生效。

## 落点与契约

- 槽位 **`tool.call.toolview`**，kind `keyed`，`key` 就是**线上工具名**（写错就永不渲染）。
- 注册一个**已占用的 key 会替换**原视图；未占用的 key 走通用行。所以 `model_verify` 这类自家工具可以直接接管，不必改宿主。
- 宿主给视图的 props：`phase`（`preparing` | `start` | `result`）、`block`（该阶段载荷）、`callId`、`toolName`、`cwd`、`home`、`openFile`、`loadImage`、`inspect`，以及一批标准 hook（`useSession`、`useWorkspaceAccess` 等）。
- 包里声明：`package.json` 的 `dsh.client = { platform: 'web', immediately: true, inject: ['@deepseek-ai/dsh-client-ui-conversation'] }`，并在 `exports` 里给 `./client`。

## 客户端半是裸 JS 工厂

```js
window.__ModuleLoader__.load({
  id: '<包名>',
  factory(require) {
    const React = require('react')
    return { inject: ['slots'], apply(ctx) { ctx.slots.inject('<槽位>', () => ctx.slots.register({ name, key }, View)) } }
  },
})
```

- `require` 只给基线模块（React 等），**没有打包器替我们解析相对导入**；
- 因此纯逻辑必须**打成一个文件**：构建时用更轻的打包器把 `src/render/*` 与 `src/client.ts` 合成 `client.js`，`react` 保持外部。仓库目前没有打包器，这是加一个 devDependency 的理由。

## 模块划分（为路径覆盖服务）

判断逻辑全部放纯函数侧，React 只做映射：

| 模块 | 职责 | 测试 |
|---|---|---|
| `viewmodel` | props/报告 → 要画什么（判定、节点、边、标注） | 纯，100% 路径覆盖 |
| `layout` | 图 → 坐标（分层、层内排序） | 纯，100% |
| `paint` | 坐标 + 调色 → 绘制指令 | 纯，100% |
| `svg` | 绘制指令 → 标记字符串 | 纯，100% |
| `palette` | 判定 → 颜色角色（走主题 token） | 纯，100% |
| `hierarchy` | 图层级树 → 归属/细化/预算 | 纯，100% |
| `client.ts` | `require('react')` + 指令 → 元素 | 薄适配，只测「产出合法元素树」 |

这样 Node 里的套件与浏览器里跑的**是同一份编译产物**，不会出现「测的和线上跑的不是一套逻辑」。

## 探针

`probe-client` 曾用于验证通道（20 行 SVG + 槽位注册），验证完毕已从 profile 卸载。要重验，按上面的四文件结构重装一次即可；文件仍在维护者的 scratch 目录里。

## 未解：注册成功但 `active: false`

把渲染器接进本包的客户端半之后，槽位表里出现的是

```json
{ "registrant": "Gb", "key": "model_verify", "id": "dsh-model-everything", "active": false }
```

即**注册成功、但未激活**：key 被占住，视图不渲染，通用行也不兜底——卡片位置什么都不显示。

**后来右栏白板能正常出现，这条线索被推翻了一半**：客户端半确实加载了，注册也执行了。所以问题不在「半截没加载」，而在 `tool.call.toolview` 这一个注册上。已排除的与仍待验证的都记在 [diagram-component](diagram-component.md) 的「与工具卡片互不牵连」一节；卡片本身至今未在页面上验证过。

已经排除的：

- bundle 契约（`exports["./client"]`、唯一入口、`factory` 返回 `{inject, apply}`）——`tests/client` 逐条断言且通过；
- 宿主是否服务该 bundle——临时 web profile 的启动图里有我们的行，`GET /plugins/??dsh-model-everything/client.js` 返回 200，把返回的字节按页面契约执行能渲染出 SVG；
- `dsh.client.inject` 的排序猜测——去掉 `inject` 后现象不变；
- 注册参数多传 `id`——改成只传 `{ name, key }`（与 dsh-deepread 一致）后未再验证卡片。

## 教训

- **一个组件能用，不等于同一个包里的另一个注册能用**。把「客户端半能不能加载」和「某个槽位的注册能不能激活」当成两个问题分别验证，否则会在错误的那一层反复试。
- 桌面端没有页面刷新入口，读不到控制台；这类问题应当只在能读日志的环境里推进。
