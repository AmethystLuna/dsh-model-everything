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

### 0. 超时只在两处真正生效（进行中）

dsh 对 `timeoutMs` 的契约是：**声明它=声明本工具把 `exec.signal` 交给一个能停下来的实现**。现在只有
`model_verify` 和 `model_compose_verify` 满足（状态空间探索、组合乘积遍历各读一次信号，`src/abort.ts`）。
其余引擎型工具仍声明了超时却读不到信号：`model_datamodel_verify`、`model_design_review`、
`model_automaton_verify`、`model_edit`、`uml_*`、`uml_structure_verify`（`repoPath` 扫盘那条最该有）。

做法照抄现有两处：引擎入口加可选 `signal`，主循环里 `checkAbort(options.signal, '…')`，工具 `execute(args, exec)`
把 `exec.signal` 传进去。守它是 `tests/abort`（此刻只覆盖两条）。判据：任一工具在 aborted 信号下必须回
`ran: false` + `errorCode: TOOL_ABORTED` + 族 `schema`，而不是跑完再回一份报告。

### 0b. inspect 状态里的八个布尔是同一个事实（待改）

`src/index.ts` 的 `registerTool()` 把八个“某工具是否注册”的布尔全部写在一个 `try` 里：第九个 `register` 抛错时，
八个都会报 `false`，**包括已经注册成功的那些**。状态查询因此会把“部分失败”报成“全都没装”。

改法：每个工具单独 `try` 并各自记一个结果，另加 `missingTools: string[]` 说出失败的是哪几个；
守它的套件读 `status` 并对齐 `missingTools`。判据：让第九个注册抛错，状态必须点名那一个，其余仍为 true。

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
  isError, subCalls`。参数在 `args`（懒加载视图）里，但结算时读不到；**能读的是 `meta`** —— 那是宿主从
  `output.presentationMeta` 持久化下来的载荷。对照：`dsh-deepread` 的卡片就是读 `block.meta`。
- 已改：`diagram_render` 增加 `presentationMeta`，持久化 `{ source, scheme, caption }`；`src/client.ts` 的
  `sourceOf()` 先读 `block.meta.source`，再退到懒加载视图 → `args.source` → JSON 字符串 → `call.input`。
  `tests/client` 用四种形状各钉了一条。
- **生效前提：重启 DSH。** `presentationMeta` 在宿主侧，Node 的 ESM 缓存不失效，只刷新页面不够。
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

#### 3.6 气泡里折叠批注块（已停用，附两次失败的原因）

目标：发出的批注块在气泡里收成一个 `图注 ×N` 胶囊，悬停显示条目清单。实现与测试都已写好
（`src/transcript.ts`），但**没有在 `apply` 里启动**。

- **第一次失败**：用 `element.textContent = 问题` 改写消息元素。这会删掉元素的所有子节点，React 按虚拟树
  对比时结构已不一致，整条助手消息被压成一行、回复丢失。
- **第二次失败**：改成只改文本节点、芯片作为兄弟节点插入（与 `dsh-annotation-patched` 同法），仍在
  `apply` 里挂了 `MutationObserver` + 1 秒轮询。每次 DOM 变化都要扫一遍全文档的 `div/p/span/li`，并对命中的
  元素再做子树扫描；流式输出每秒改动多次 → 扫描几乎连续运行，会话容器卡死。
- **再启用的前提**：把扫描范围限制在消息容器内、每发一条消息只扫一次，而不是每次 DOM 变化都扫，也不要
  用 `setInterval` 兜底。对照实现见 `@dsh-external/dsh-annotation-patched` 的 `client.js`（它按文本节点切、
  芯片做兄弟节点，并在流式期间限流）。
- 判据：给一条批注，气泡只剩胶囊；连续对话十分钟，容器不卡顿、助手消息与代码块显示正常。

**与同类插件共存（硬约束）。** 同屏还装 `@dsh-external/dsh-annotation-patched` 时，两个插件都会在对话 DOM 上动作，
必须遵守四条，否则会互相覆盖：

1. **只认自己的标记**：本插件只处理文本里含 `Diagram annotations -` 的气泡，绝不按 `annotation` 这类通用词匹配；
2. **属性全部 `data-dme-*`**，遇到 `[data-annotation-*]`（对方的地盘）直接跳过，不写、不删、不改；
3. **自己插入的节点带 `data-dme-own`**，方便对方对称地跳过我们（`isForeign()` 已实现并有测试）；
4. **草稿只 prepend、不覆盖**：两边都通过宿主 `setDraft` 写草稿，写之前立即重读，保留其余内容原样。

碰撞面四处，按危险程度排：草稿（会丢对方内容）> 同一气泡的文本（互相重写）> 全局按键拦截（会抢发送）> 浮动层 z-index（视觉遮挡）。

**一条操作纪律（2026-11-07 踩到）。** 在桌面 profile 里用工具安装本插件时，那次安装调用被外层超时强杀，
pnpm 的 import 停在半路：包目录只剩一个子目录，而且该子目录此后连 SYSTEM 身份都拒绝访问（所有权、DACL、
`takeown`、计划任务都以 access denied 收场），于是包既装不完也删不掉。恢复办法是**不要**再走一次完整安装：
把发布到源上的 tarball 直接解开覆盖回该包目录，再把两个技能复制到用户级技能目录顶上，等宿主重启后由安装流程
自己收尾。教训只有一句：不要在安装动作外面套一个可能把进程杀掉的短超时。

> 上面这一节随 0.6.0 发布：代码在 `main` 上，标签已推。

## 已结案的去处

| 曾经在这里 | 现在在哪 |
|---|---|
| 发布、挂载轮次、兼容性区间扫描、商店与目录上架 | [RELEASE.md](../../../RELEASE.md)、[DSH-COMPATIBILITY.md](../../../DSH-COMPATIBILITY.md)、[商店与目录上架](../design/store-entry.md) |
| 部署面实跑查出的缺口（两种拒绝形状、两处静默读作通过） | [部署面](../design/deployed-surface.md)；逐条修复与判据落点见[稳健性审查](../design/robustness-audit.md) |
| 十四个图族的实现状态、拒绝理由，以及「每加一族做什么」 | 实现与拒绝理由：[UML 检查码覆盖与编号](../design/uml-check-coverage.md)；动作清单：[docs/feature-checklist.md](../../../docs/feature-checklist.md) 的 *A UML diagram family* |
| 记号能力（哪个族在哪种记号里能画、能读） | [记号覆盖调研](../research/uml-notation-support.md) |
| `modelPath` 评测结果、设计审阅专项、稳健性审查 D1–D12 | 各自的主题文件；结论已落在技能正文与 `tests/` 里 |

## 写作纪律

**不为文档改动单独发版**（2026-11-07 用户要求）。文档、注释、措辞类的改动留在 `main` 上，跟下一个功能或修复版本一起发；
版本号只在真正要交付一个可安装的差异时才动。发版动作包括 tag 与 `npm publish`，两者都不该被一次措辞修订触发。

**所有文档类内容的更新，都必须先有思维导图作为行文结构的指导**，再动笔。用户明确要求，而且它付过账：
图改变过写什么，不止一次暴露出正文里写错的数字。已用此法做过的图都在 `docs/` 下，由脚本从真实语料生成。
