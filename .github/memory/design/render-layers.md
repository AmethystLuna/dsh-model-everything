---
name: render-layers
description: 渲染管线的分层约定：paint 只做画布与编排，六块策略各有独立模块与套件，以及一条新策略该放在哪一层
metadata:
  type: design
---

# 渲染的分层

> 上级：[INDEX-design.md](../INDEX-design.md)　·　什么时候读：加一条绘图策略、改 `paint.ts`、或判断一段几何逻辑该不该单独成模块之前

管线本身是四段：解析（`from-plantuml` / `from-mermaid`）→ 模型（`Diagram`）→ 布局（`layer`/`order`/`coords`/`channels`/`route`）
→ 绘制（`paint`/`toSvg`）。这是 PlantUML 的分法：它把布局交给 dot 之类的引擎，自己只做解析与绘制；这里把 dot 的那部分
自己实现，于是“对齐 PlantUML”实际是“对齐 dot 的 rank、order、port、lane 规则”。

## 绘制层的分工

`paint.ts` 是**画布与编排**：它知道盒子、其它路线、端口与颜色，因此它提供“这个候选会不会撞上什么”的判定；它不决定
“撞上之后怎么办”。后者按策略分给六个模块，每个都有不画图的套件：

| 模块 | 决定什么 | 套件 |
|---|---|---|
| `jog.ts` | 短台阶要不要合并、删哪些点 | `tests/jog` |
| `separate.ts` | 两条路线共了多少线、整图总量 | `tests/separate` |
| `lift.ts` | 终端腿抬到多长、什么时候放弃 | `tests/lift` |
| `repair.ts` | 穿盒后问路由器几次、取哪个答案 | `tests/repair` |
| `ports.ts` | 一侧端口怎么分布、行怎么居中 | `tests/ports` |
| `labels.ts` | 标签走哪条跑段、什么情况下接受遮挡 | `tests/labels` |

公共入口不搬家：`placeLabel`、`LABEL_HEIGHT`、`LabelPlacement` 仍在 `paint.ts` 重新导出，抽取不移动别人 import 的地方。

## 一条新策略该放哪

1. 它只依赖点、线、数？→ 放进 `src/render/<name>.ts`，判定用回调（`blocked` / `free` / `crosses`）传进来；
2. 它需要盒子或其它路线？→ 模块只收判定函数，`paint` 提供实现；
3. 它在别的策略之后跑、会改变它们的结论？→ 先在 `paint` 里按顺序编排，再决定要不要独立模块；
4. 它改变输出？→ 先证明二十张验收图逐字节相同（或变化可解释），再提交。这条不是形式：抽 `lift` 时方向推反过一次，
   五张图立刻变了，哈希比对是唯一当场发现它的手段。

## 一次失败的拆分（第 74 轮，已回滚）

想把 `from-plantuml.ts`（近千行）里的词表与 `reference()` 拆到 `plantuml-reference.ts`。做法是**先量好行号再按区间剪切**——
两次都剪错：一次把 `ensure()` 一起搬走（它依赖 `Builder`，必须留在解析器），一次区间少算了一行，留下半个函数。每次都要重来，
最后整体 `git checkout` 回滚，仓库回到拆分前状态（验收图逐字节一致）。

**第二次按新方法做成了**（第 75 轮）：按**函数名**定位、用“行尾是 `{` 就往下找到列 0 的 `}`”算出块边界、一次只搬一个块、搬完立刻 `tsc` 并比对 20 张图哈希。
结果：`from-plantuml.ts` 982 → 907 行，`plantuml-reference.ts` 93 行（词表 + `reference()` + `readArrow()`），验收图逐字节不变，
并且第一次能给 `readArrow` 写单元套件（8 条，覆盖方向由记号决定、虚线与实线、两端带记号拒收、端点装饰不入名）。

结论：**行号手术不可行**；按函数名定位 + 单块搬运 + 每步验证可行。`ensure()` 依赖 `Builder`，必须留在解析器——这条也在第二次
尝试中再次确认。老方法写在这里，下次拆分直接照做。
一个小的搬运脚本读 AST 边界；不要再用人工数出来的行号。已回滚，因此没有遗留风险。

## 总账：行族 × 模块 × 套件 × 变异点（第 86 轮）

`src/render/` 下 43 个模块；49 个变异点分布在 13 个文件上；`test:engine` 跑 62 个套件。

| 行族 | 模块 | 套件 | 变异点 |
|---|---|---|---|
| 引用、箭头、边界名、关键字表、块成员 | `plantuml-reference.ts` | `arrows`、`names` | M41 M42 M43 |
| 非图源行（预处理、布局、hide、include、`;`） | `plantuml-directives.ts` | `directives` | M44 |
| 页面行（标题、页文、方向、scale、背景、skinparam） | `plantuml-page.ts` | `directives` | M45 |
| 声明行 | `plantuml-declaration.ts` | `declaration` | M46 |
| 边界开闭 | `plantuml-boundary.ts` | `boundary` | M47 |
| 箭头含义（含 `[*]` 出口） | `plantuml-edge.ts` | `edge` | M48 |
| 注释定位 | `plantuml-note.ts` | `note` | M49 |
| 带标记的边（方向、hidden、起始） | `plantuml-marked-edge.ts` | `marked-edge` | M50 |

**覆盖率的诚实说明**：这 8 个模块只有 10 个变异点，而 `paint.ts` 一个文件就有 9 个。原因不是它们更安全，而是它们的判定更容易被**单测**
逐条钉住——8 个套件共 60 余条用例，每条断言一个回答。变异点的数量在这里衡量的是“哪些代码没有别的套件盯着”，不是“哪里风险高”。

## 剩余构成（第 86 轮实测）

`from-plantuml.ts` 628 行（含类型与 `ensure`/`keywordOf` 166 行）：`fromPlantUml` 从 167 行开始，分三段——

| 段 | 行数 | 内容 |
|---|---|---|
| 块预收集 | 111 | legend / page text / title / note 的 `collectBlocks` 与未闭合报告 |
| 单行分派 | 174 | 主循环：together 记帐、页面、指令、标记边、箭头、边界、声明、注释、拒收 |
| 尾声 | 177 | 边界与同名节点的消解、`together` 报告、图的最终组装 |

尾声是剩下的第二大盘子，也是最难拆的一处：它要同时看 `builder.nodes`、`builder.groups`、`builder.implicit` 和若干 `Map`，
本质是一次**图的修正**，不是“读一行”。下一轮若要继续，目标是把它提成 `resolveBoundaries(builder): void`，并用同样的方式验证
（20 张图逐字节 + 现有 62 套件）。

## 解析器现在的样子（第 75–83 轮拆分后）

`from-plantuml.ts` 从 982 行降到 612 行，读一行的判决按“行族”分散到六个模块，每个都能脱离画布测试：

| 模块 | 决定什么 | 套件 |
|---|---|---|
| `plantuml-reference.ts` | 一个引用、一个箭头、一个边界名、元素关键字、块成员 | `arrows`、`names` |
| `plantuml-directives.ts` | 非图源行：预处理、布局控制、`hide`、`include` | `directives` |
| `plantuml-page.ts` | 标题、页文、方向、`scale`、背景、`skinparam` | `directives` |
| `plantuml-declaration.ts` | 声明行的元素与装饰 | `declaration` |
| `plantuml-boundary.ts` | 边界的开与闭、实线/虚线 | `boundary` |
| `plantuml-edge.ts` | 箭头意味着什么（含 `[*]` 出口） | `edge` |

解析器仍保留：块预收集（header/legend/note）、注释定位、`together` 的记帐、边界栈、会话尾声。主循环 390 行、34 个分支，
其中 6 处是“把这一行交给某个模块”。

两条由哈希而非套件发现的教训（都在这一轮系列里）：**note 守卫**和**出口虚线的 dashed 丢失**——套件测行为，属性丢失只改字节。
所以每次搬家都必须跑 20 张图的逐字节比对，不能只看套件绿。

第三个发现更隐蔽：解析器里 `...(effect.dashed === undefined ? {} : { dashed: true })` 会让 `false` 也变成虚线，
于是“出口是否虚线”这个变异在语料里看不见（图仍然虚线）。改成 `=== true` 之后语料立刻能抓到。**展开条件写错方向，等于把测试废掉。**

## 不算进去的东西

布局（rank/order/lane）与绘制（形状、遮罩、文本）各自成层，策略模块**不**画任何东西，也不持有盒子列表。把盒子传进
策略模块是这条约定的第一条裂缝：一旦它能看盒子，就会开始决定盒子该在哪。
