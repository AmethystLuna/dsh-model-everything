---
name: uml-check-coverage
description: UML 检查码的覆盖与编号：每条规范约束落在哪个模块、是实现了还是按设计拒绝，以及用例族与多层级复用同一段号码这一处编号冲突
metadata:
  type: project
---

# UML 检查码：覆盖与编号

这份表回答两个问题：`uml_review` 报出的某个码从哪里来；以及**哪些缺陷这个构建根本不检查**——不检查与检查通过必须分开说，否则一张干净的图会被读成一张被审过的图。

## 1. 覆盖：实现到哪一步

判定依据是[审阅清单](../research/uml-review-checklist.md)的三档来源：`[WFR]`（规范约束，应为 error）、`[TOOL]`（某工具定义的完备性规则，应为 warning）、`[STYLE]/UNCONFIRMED`（风格或无来源，未确认前不报）。

| 图族 | 实现 | 落在哪 | 未实现 |
|---|---|---|---|
| 状态机 / 活动 | `UML001`–`UML019`、`UML027`、`UML041` | `src/uml.ts` | 清单第 10、13 节里按 `[WFR]` 列出的大部分条目（区域初态、fork/join 基数、History 顶点、转移端点同机等） |
| 用例 | `UML030`–`UML039` | `src/uml-usecase.ts` | `[WFR]`：用例之间的关联、非二元关联、include/extend 端点类型、扩展点归属、重名；`[TOOL]`/风格项大多未实现 |
| 类 / 对象 / 包 / 组件 / 部署 | `UML020`–`UML026`、`UML040` | 审查由 `src/uml-structure.ts` 转到 `src/structure.ts`，与 `uml_structure_verify` 同一份实现 | 清单第 1–6 节几乎全部 `[WFR]`：泛化环与 isLeaf、成员可区分、悬空关联端、多重性、导入自身、Port 与 Connector 的角色、Node 内部结构等 |
| 定时 | `UML042`–`UML049` | `src/uml-timing.ts`（PlantUML 可 render 可 parse；Mermaid 无此图） | 清单第 14 节的 `[WFR]`：DurationConstraint/TimeConstraint 的受约束元素基数、Duration/TimeExpression 与观测的对应、`InteractionConstraint` 的 minint/maxint 规则、负的 `when`。这些读的是时间/持续时间约束，本模块目前只承载 `<->` 区间 |
| Profile | `UML050`–`UML056` | `src/uml-profile.ts`（PlantUML 只 render，`parseable: false`） | 清单第 7 节按 `[WFR]` 列的约束（Extension 的 `isRequired`、`ExtensionEnd` 的聚合与多重性、ProfileApplication 与被应用包的对应、stereotype 与 metaclass 的重名冲突等）——这些要读出图里的扩展端点与 ProfileApplication，而记号没有这两样 |
| 复合结构 | `UML057`–`UML062` | `src/uml-composite.ts`（PlantUML 可 render 可 parse：近似视图但实测往返无损） | 清单第 5 节按 `[WFR]` 列的约束（part 的类型与多重性、port 的 required/provided 接口、connector 两端的角色名与类型兼容、collaboration 与 role binding）——记号一个都表达不出，模型里也不假装有 |
| 通信 | `UML063`–`UML068` | `src/uml-communication.ts`（PlantUML 可 render 可 parse：近似视图，往返无损） | 清单第 12 节按 `[WFR]` 列的约束（消息必须是 link 的实例、link 的两端类型兼容、并行消息的次序、`GeneralOrdering`）——这些要读出 link 的元模型与消息的 `MessageEnd`，而记号只画一条带编号的箭头 |
| 交互概览 | `UML069`–`UML074` | `src/uml-interaction-overview.ts`（Mermaid 只 render，`parseable: false`） | 清单第 13 节按 `[WFR]` 列的约束（内联交互的 combined fragment 与 operand、InteractionUse 的实参绑定、概览节点与所引用交互的对应）——画成流程图后一个节点只带名字，这些读不出来 |

**十四个族全部有实现路径**：三个机器族走 `src/uml.ts` 的机器路径，其余十一个各有 `UmlFamilyModule`。剩下的拒绝都是记号能力的拒绝（`profile` 与 `interaction-overview` 不读、`sequence` 不读），没有「本构建没有模块」这一档了。

**这张表怎么用**：结构族与复合结构族没有按元素类型区分缺陷的能力——它们的审查是依赖图审查，加一条节点未命名（`UML040`）。因此「`uml_review` 没报错」对类图、包图、组件图、部署图**不等于**没有违反规范约束，只等于依赖图层面没有发现。要说一张结构图干净，得再说明没有检查的那一半。复合结构是例外：它有专门的模块与检查码（端口是否接上、连接器端点是否存在、part/port 是否重名），但它检查的是**这张图内部自洽**，不是「分解得对不对」——后者要读设计。

## 2. 用例族的 severity 与清单对齐（2026-10 校准）

`UML030`–`UML039` 逐条对过[审阅清单第 8 节](../research/uml-review-checklist.md)：

| 码 | 等级 | 对齐依据 |
|---|---|---|
| `UML030_USE_CASE_NO_ACTORS` | error | 空图没有可审内容，与结构族的 `UML026_NO_NODES` 同级 |
| `UML031_USE_CASE_NO_USE_CASES` | error | 同上 |
| `UML034_DANGLING_RELATION_ENDPOINT` | error | 端点未声明属解析/解析引用失败，`[TOOL]` 定为 error |
| `UML035_INCLUDE_EXTEND_CYCLE` | error | include 成环是 `[WFR]`（S18.2.5.6）。**只由 extend 成环没有规范依据**（Extend 的约束只有扩展点），清单定为风格项；实现不区分两者，统一 error，这是有意的：同一个码承担更强的那条依据，宁严不宽 |
| `UML036_ACTOR_TO_ACTOR_ASSOCIATION` | error | `[WFR]`（Actor 的关联只能指向用例/组件/类） |
| `UML037_ACTOR_INCLUDE_EXTEND` | error | 端点元型违反（Include/Extend 两端都必须是用例） |
| `UML032_ISOLATED_ACTOR` | info | `[TOOL]`：MagicDraw 的 Actor and Usecase 规则把「参与者未参与任何用例」定为 info。2026-10 由 warning 降为 info——单个未被使用的参与者不是建模错误，图可以先画参与者后画用例 |
| `UML033_USE_CASE_WITHOUT_ACTOR` | warning | 镜像检查在清单里标 UNCONFIRMED（无规范依据、无工具规则），按风格项报 warning |
| `UML038_SELF_RELATION` | warning | 自环边在清单的跨图族一节按 `[TOOL]` 记（`no-self-loop`） |
| `UML039_USE_CASE_UNDOCUMENTED` | info | 文档缺口，与 `UML014`、`UML040` 同级 |

判定原则由清单末尾给出：只有 `[WFR]` 报 error，`[TOOL]` 报 warning 并点名定义它的工具，`[STYLE]` 只在项目约定采用时才报，且不得称为「违反 UML」。

## 2b. 定时族（2026-10 新增，模块 `src/uml-timing.ts`）

PlantUML 可 render 可 parse，Mermaid 无此图（能力矩阵 `none`）。检查码 `UML042`–`UML049` 全部来自「图与模型能不能彼此承载」，不是规范第 14 节的 `[WFR]` 清单：

| 码 | 等级 | 为什么是这个等级 |
|---|---|---|
| `UML042_TIMING_NO_LIFELINES` | error | 空图没有可审内容，与 `UML026` 同级 |
| `UML043_TIMING_EMPTY_LIFELINE` | warning | 画了但不说话的参与者是完备性缺口，不是规范违规 |
| `UML044_TIMING_TIME_ORDER` | error | 模型即行序，按时间写；倒序意味着某个状态在它开始之前就结束了（负时间**合法**，是读者关心那一刻之前的 run-up，所以不判符号） |
| `UML045_TIMING_SIMULTANEOUS_STATES` | error | 一条 lifeline 同一时刻只能处于一个状态；渲染器只保留最后一条，模型不能说出图承载不了的事 |
| `UML046_TIMING_UNDECLARED_REFERENCE` | error | 端点未声明，PlantUML 会安静地画一条空时间轴——错字因此不可见 |
| `UML047_TIMING_CONSTRAINT_RANGE` | error | 时长约束自己前后倒置 |
| `UML048_TIMING_STATE_UNUSED` | warning | 完备性缺口，同 `UML043` |
| `UML049_TIMING_UNDOCUMENTED` | info | 文档缺口，与 `UML014`、`UML039`、`UML040` 同级 |

整块没实现的是清单第 14 节的 `[WFR]`（受约束元素基数、Duration/TimeExpression 与观测的对应、`InteractionConstraint` 的 minint/maxint、负的 `when`）：那些读的是时间与持续时间的约束对象，本模块只承载 `<->` 区间。**「定时图没报错」不等于这些约束成立。**

## 3. 编号冲突：`UML030` / `UML031` 被两处占用

- `src/uml-usecase.ts`：`UML030_USE_CASE_NO_ACTORS`、`UML031_USE_CASE_NO_USE_CASES`
- `src/granularity.ts`：`UML030_PARENT_CYCLE`、`UML031_NO_DIAGRAMS`

两份报告互不引用，所以今天不会误判。风险在两处：读报告的人看到 `UML030` 无法只凭号码判断出处；`report_diff` 的发现身份由「码 + 定位」组成，同一号码跨族出现时，定位不同才救得回来。

**处置**：不改。已发布的码是报告契约，改号是破坏性变更，须走 major 版本与发布说明。要改就一次做完——把多层级那族让到 `UML042` 以上，或给用例族另开一段，并在发布说明里列出新旧对照。`UML042` 以上已被定时族占用（`UML042`–`UML049`），所以「让到 042 以上」这条路已经没有了：真要清理，得给多层级另找一段空号。
