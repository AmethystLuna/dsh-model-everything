---
name: open-work
description: 交接待办清单：两个待定的决定、画图与批注的五项收尾（含判据）、已完成项的去处、写文档前的那条纪律
metadata:
  type: project
---

# 交接待办清单

这里只放**还没做完**的事。做完一项就地删掉，别留成历史；被否决的条目先写成一句结论放进 `design/`，
再从清单里删。2026-10-29 清理时已结案的那一批，快照在[归档](../../../archive/README.md)里。

## 现在的状态

- 已发布 **0.5.2**，`main` 干净，`npm run check` 全绿。发行流程见 [RELEASE.md](../../../RELEASE.md)，
  每一版的兼容性证据见 [DSH-COMPATIBILITY.md](../../../DSH-COMPATIBILITY.md)。
- 渲染器这一轮的现状、**改了但没测**的地方与下一步顺序，见[渲染流水线交接](2026-10-render-handover.md)。
  那一篇同时是接手渲染工作的起点。
- 加能力该动哪些文件、由哪个套件守着，见 [docs/feature-checklist.md](../../../docs/feature-checklist.md)。

## 未完成

### 1. 要不要拆成多个组件（待定）

现状：一个包、一行 loader 条目、一个总开关（本插件自己的 `config.enabled`；dsh 那一侧的开关是行级
`disabled`，两者别混）。事实上已经按行拆过两次：路由注入一行（`…-gate`），画图一行（`…-diagram`）。
还没拆的是**工具面**：全部工具仍共用一行。

机制是现成的：一个包可以用 `exports` 暴露多个子路径，`cordis.patch.yml` 一个组件插一行，每行可以单独
`disabled`；组件可以有自己的卡片名（`<子路径>/package.json` + 同目录 `locale/*.json`），跨组件只能走服务
注入。机制细节与判据见[插件开发规范](../design/plugin-dev-spec.md)。

拆的收益：只想要某一块能力的人，不必为全部工具的描述付出上下文；卡片上按组件列出，开关也按组件给。

拆的代价：技能要按组件分区，否则禁用某个组件后，技能里会指向不存在的工具（组件行注销时它的技能
provider 一起走，但入口技能的路由表还留着那条路）；工具注册测试要覆盖组合矩阵；插件卡片会从一个变成几个。

倾向：**仍不拆**。等出现明确的「只要图、不要引擎」的用户诉求，或工具描述的体积成为负担时再拆。

### 2. 技能正文的中文副本（样例已定，未铺开）

样例是 `skills/model-everything-interleaving/SKILL.zh-CN.md`——域技能里最小的一个。格式与门禁都已落地：
`tests/translation` 的 `PAIRS` 登记了这一对，`docs/README.md` 的语言政策写明**模型只读 `SKILL.md`，
`.zh-CN.md` 是给人读的**，所以它是同一份方法的可读副本，不是「技能的另一种语言版本」。门禁要求译文与
英文同标题、同表行数、同标识符集，且中文占比 ≥15%（防止拿复制冒充翻译）。

要铺开的量：其余 `SKILL.md` 合计约是样例的 19 倍，连参考资料一起铺约 56 倍；其中入口技能
`model-everything` 一家（正文加参考）就占了一半以上。

建议：只铺 `SKILL.md`，参考资料按需再议；入口技能单独作为一个决定（它一份顶其余六个）。

### 3. 画图与批注的收尾（2026-10-30）

卡片与白板现在都能画、能批注，但还没有一处「在页面上确认过」。下面五条按优先级排，每条都写了判据。

#### 3.1 卡片画图（已改，待确认）

- 现象：卡片只显示 `no drawing in this call · block: …`，画不出图。
- 原因：结算后的 `block` 是 `kind, seq, time, callId, parentCallId, name, args, call, callTime, content, meta,
  isError, subCalls`，参数可能在 `args`（懒加载视图）、`call.input` 或 `meta` 里；卡片原先只读了一种。
- 已改：`src/client.ts` 的 `sourceOf()` 依次读 懒加载视图 → `args.source` → JSON 字符串 → `call.input` →
  `meta.source`，取第一个非空；`tests/client` 用三种形状各钉了一条。
- 判据：刷新后 `annotation flow` 那张卡片画出 9 个节点，而不是那句占位话。

#### 3.2 待发清单的吸附

- 现状：`position: fixed` + **渲染时量一次**输入框矩形（`composerRect`）。滚动、缩放、窗口变化后会漂。
- 下一步：挂 `ResizeObserver` 与滚动监听，位置变了就重排；或改成把控件渲染进 composer 的定位容器。
- 判据：把对话滚到底、把窗口拉窄再拉宽，控件始终贴在输入框上方 40px 内。

#### 3.3 用户自己按回车时的拼接

- 现状：只有点控件上的「发送」才把块插入并回车；用户直接按回车时，待发的图注不会进消息。
- 下一步：在输入框上挂**捕获阶段** `keydown`（Enter、非 Shift、非 composing），先把块拼进草稿再放行；
  受控输入框要用原型的 `value` setter + `input` 事件，否则 React 看不到变化。
- 判据：有待发图注时，直接按回车，发出的消息里带着编号块。

#### 3.4 命令通道（A）与会话 id

- 现状：宿主侧已注册 `annotate` 命令（`src/diagram.ts` 的 `registerAnnotateCommand`，handler 走
  `agent.followup`），客户端也能探测 `sessions.scope(id).remote.commands.execute`；**缺的是会话 id**——
  页面地址是 `/`，客户端服务目录里没有「当前会话」。
- 下一步：先从槽位 props 或 DOM 属性里找 id（客户端检查里能拿到 props 的只有槽位投影）；找不到就维持
  输入框通道，把命令通道留作有 id 时的快路径。
- 判据：状态行出现「已发送（会话命令）」，且会话里多出一条用户消息。

#### 3.5 卡片与白板的布局、样式

- 卡片：批注编辑器是内联的（`floating: false`），夹在图与按钮之间，间距与按钮排布还没和白板统一。
- 白板：控制条（缩放 / 批注 / reset / fit / 配色）挤在一行，窄面板会折行；浮窗宽度写死 260px，窄面板会溢出。
- 下一步：两处共用一套 token 与尺寸（颜色已经走 `--dsw-alias-*`，尺寸还没抽），控制条拆两行、浮窗宽度随容器。
- 判据：把白板拉到最窄，控制条不折行、浮窗不超出面板；卡片与白板的按钮高度、圆角、间距一致。

> 截至写这篇时，上面这些改动都在本地 `main` 上，领先 `origin/main` 16 个提交，**未推送**。

## 已结案的去处

| 曾经在这里 | 现在在哪 |
|---|---|
| 发布、挂载轮次、兼容性区间扫描、商店与目录上架 | [RELEASE.md](../../../RELEASE.md)、[DSH-COMPATIBILITY.md](../../../DSH-COMPATIBILITY.md)、[商店与目录上架](../design/store-entry.md) |
| 部署面实跑查出的缺口（两种拒绝形状、两处静默读作通过） | [部署面](../design/deployed-surface.md)；逐条修复与判据落点见[稳健性审查](../design/robustness-audit.md) |
| 十四个图族的实现状态、拒绝理由，以及「每加一族做什么」 | 实现与拒绝理由：[UML 检查码覆盖与编号](../design/uml-check-coverage.md)；动作清单：[docs/feature-checklist.md](../../../docs/feature-checklist.md) 的 *A UML diagram family* |
| 记号能力（哪个族在哪种记号里能画、能读） | [记号覆盖调研](../research/uml-notation-support.md) |
| `modelPath` 评测结果、设计审阅专项、稳健性审查 D1–D12 | 各自的主题文件；结论已落在技能正文与 `tests/` 里 |

## 写作纪律

**所有文档类内容的更新，都必须先有思维导图作为行文结构的指导**，再动笔。用户明确要求，而且它付过账：
图改变过写什么，不止一次暴露出正文里写错的数字。已用此法做过的图都在 `docs/` 下，由脚本从真实语料生成。
