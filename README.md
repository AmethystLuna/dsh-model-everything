# 设计与代码的建模/自动化审查（dsh-model-everything）

<p align="center"><a href="README.en-US.md">English</a> · <strong>中文</strong></p>

<p align="center">
  <a href="https://github.com/AmethystLuna/dsh-model-everything/actions/workflows/dsh-bundle.yml"><img src="https://github.com/AmethystLuna/dsh-model-everything/actions/workflows/dsh-bundle.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20-blue.svg" alt="Node 20+"></a>
  <a href="https://afdian.com/a/amethystluna"><img src="https://img.shields.io/badge/%E7%88%B1%E5%8F%91%E7%94%B5-Afdian-946CE6" alt="在爱发电上赞助"></a>
</p>

把设计与代码里的断言抽象成模型，交给引擎跑一遍：结论带出处与哈希，能复算、能比对。让结论来自一次运行，而不是一次通盘推理：把「想清楚」变成「跑一遍」。

DeepSeek Harness 原生插件。把设计与代码里**关于行为的断言**变成可运行、可审查、可导出的模型：

- **核验断言**：逐条对着源码检查，引用到 `file:line`。
- **跑模型**：状态机、协议、多机协作、数据模型先建成可执行模型，再交给引擎跑。
- **审图**：UML 图按模型读、按模型审，并与模型对照。
- **对照重构**：重构前后各建一份模型，两份报告摆一起比。
- **留痕**：结论固化成带哈希的报告，可复算、可比对、可导出。

## 面向中大型、中高复杂度项目的建模审查工具

这是一个**能力型工具，不是省钱工具**，定位很具体：**中大型、中高复杂度的项目**。

**在这个尺度上它才成立。** 几百行的夹具上它贵出数倍——技能正文与工具定义这些固定成本摊不开；对象到几万行、上百文件，比例回落到持平附近，我们测到 0.93×–1.11×。区别在于**一次判定替代的是几十次阅读**，而不是几行代码，所以这笔钱只有在复杂项目里才值。

换来的是别的东西：

- 一条**可复算**的结论：哈希、`verdict`、出处，而不是一段读起来像结论的散文；
- 一条**反例路径**：哪几步、哪个事件序列让断言不成立；
- 一份**可导出的模型**：同一条结论能交给 UPPAAL、TLA+、PRISM、SPIN 复核。

**它的边界有两个。**

一是**项目规模**：在只几百行、断言靠通读一次或三行脚本就能数出来的小项目里，它最贵也最没有价值。

二是**抽象位置**：它判定的是**已经被人抽象好的小模型**，不是程序本身。模型炸开时会报 `truncated` 并点名未决的检查——那不是重试一个更大的 `maxStates` 能解决的：先减模型（去掉性质不读的变量、合并对称状态），仍然炸开就换不靠枚举的工具，SPIN 的偏序归约、NuSMV 的符号化、CBMC 的有界 SAT。本插件不建立抽象，也不读程序源码。

## 报告卡片

每份报告在终端里照常显示全文，同时在支持渲染的界面里给一张卡片。这不是第二份结论：卡片是**同一次计算**的另一种排布。

- **先给判定**，再给首条问题，最后给下一步；
- **diff 把两件事分开写**：这次改动新增了什么，以及当前报告本身是什么判定——它们只会在「干净改动落到一份本来就失败的报告上」时不一致；
- **设计审阅分三级**：violation 决定判定，signal 是结构事实，fact 是测量；三者不会合并成一个数字；
- **交错扫描**读完只说明「已把断言路由给能判定它的工具」，卡片上写着它**没有证明任何一条**；
- 没有卡片时退回原始文本，不会因为界面不支持而丢掉结论。

卡片**不节省任何 token**：模型看到的仍是全文。

## 能力范围

| 域 | 做什么 |
|---|---|
| 事实核验 | 把一份设计/规格/评审意见里的可验证断言列出来，逐条对着代码核验并给出出处。核不了的直接说明 |
| 行为验证 | 状态机与协议：结构检查、对抗性探测、预算与时限、before/after 回归。多机组合查死锁，以及永不发生的会合（握手事件）。有限词自动机判语言关系（等价、包含）并给出最短反例词 |
| 图 | UML 2.5 各图族的渲染、解析与建模审查（含 render→parse 往返一致性对照），覆盖 Mermaid 与 PlantUML 两种记号 |
| 结构 | 组件/包/类/部署图按依赖图审计：孤立节点、悬空引用、环、矩阵与分层违规、缺失的必需边 |
| 数据 | 数据模型与迁移：结构、迁移覆盖、拷贝一致性、回滚对称、前后数据回归 |
| 并发 / 同步 / 异步 | 挖掘"工作怎么被执行"的断言（线程安全、锁、中断、async/await、事件循环…）并路由到能判定它的工具；它自己不证明 |
| 导出 | 已验证模型导出为 UPPAAL / TLA+ / PRISM / SPIN 的输入 |
| 报告 | 报告正文渲染、基线比对（`report_diff`）、哈希规范。每份报告另带一份给界面用的摘要：verdict、首条问题、下一步，正文照旧给模型 |

## 典型用法

每个场景都只讲「给什么、看哪个字段、它不管什么」。

### 重构 harness

1. 重构前抽 **BEFORE** 模型；数据侧留一份旧 schema。
2. 重构。
3. 抽 **AFTER** 模型。
4. `model_verify` 带 `beforeModel` 与 `stateMapping`；数据侧用 `model_datamodel_verify` 的 `fieldMapping`。
5. `report_diff` 拿基线报告比对：**新增的 error 就是拒绝这次重构的理由**。

它比的是两份模型，不是两份代码；也不读 diff、不改代码、不跑测试。

### 状态机与流程图

1. 图交给 `uml_parse`，或直接按 schema 写模型。
2. `model_verify` 跑结构检查与对抗探测：不可达、吸收环、被静默忽略的事件、预算、时限。
3. 把「永远 / 绝不」写进 `invariants`，拿回最短反例路径。
4. 只看图本身用 `uml_review`：分支是否穷尽、有没有死端。
5. 每条 error 回到代码核验；改模型用 `model_edit`，一次调用拿回结构 diff 与发现 diff。

**图画对了不等于代码写对了**——那一步由抽取负责。

### 审计一张依赖图

1. 给图，或给 `repoPath` 让 `uml_structure_verify` 直接从源码建图。
2. 有规则就给矩阵：`layers` 加 `rules`。
3. 读发现：环、孤立节点、悬空端点、越层边、缺失的必需边。解析器报**标签漂移**时，`uml_explain_labels` 打印该记号接受的写法。

**事实归它，规则不归它**：某条边到底存不存在，问这个工具；该不该允许，是 `model_design_review`。

### 让设计对自己作出的声明负责

1. 把设计与它声明的规则写成 `DesignModelV1`。
2. `model_design_review` 报三类：`violations` 决定判定，`signals` 只是信号，`facts` 是测量。
3. 没声明任何可对照的东西时，对应检查是 `skip`，不是 pass。

它**不按外部标准**评判设计，只问：它就自己的说法而言站得住吗。

### 两台必须互相配合的机器

1. 各自建模，一起给 `model_compose_verify`。
2. 需要双方同时就绪的会合写进 `rendezvous`。
3. 读 C1 死锁与 C2 永不触发的会合，各自带逐机理由与最短反例。

单台机器自己的问题回 `model_verify`；组合里没有速率比，也没有公平性。

### 并发声明：挖掘并路由

1. `model_interleaving_scan` 扫文本，按 `family` 报出绝对断言（线程安全、lock-free、ISR 安全…）。
2. 每条点名能判定它的分析：TSan / Helgrind、CBMC、TLA+、RTOS 感知分析。
3. 本插件**不运行**那个分析，也不对并发安全作任何证明。

一次干净的扫描不是健康证明——它的含义只是没找到声明。

### 一次迁移：前后两份模型

1. 前后各一份数据模型。
2. 给 `fieldMapping`；来源不是自己旧名字的字段用 `migrationMappings`。
3. `model_datamodel_verify` 查迁移覆盖、拷贝一致性、回滚对称、前后数据回归。
4. `DS2_REQUIRED_FIELD_UNSOURCED` 是 **warning**：它是要你做的决定，不是引擎能替你宣布的失败。

### 语言包含：两台自动机

1. 把规范与实现各自写成自动机：`states`、`alphabet`、`transitions`、`accepting`。
2. `model_automaton_verify` 带 `other` 与 `relation`（`equivalent` / `subset` / `superset`）。
3. 关系不成立时拿走**最短反例词**——一个实现接受、规范拒绝的词，可以直接在两台机器上重放。

只判有限词。liveness、公平性与时序需要 Büchi 或时间自动机，这个族不做。

### 图的导入与导出：冻结与迭代

1. `uml_render` 写出 Mermaid / PlantUML 源，`uml_parse` 读回模型。
2. 图源、模型与那次验证的报告一起提交，作为某个时间点的设计记录。
3. 下次改动重抽、重跑，用 `report_diff` 与冻结的那份比对。
4. 要交给外部检查器，用 `model_export` 出 UPPAAL / TLA+ / PRISM / SPIN。

它保留的是**源文件**，渲染出的图片只是副产品。

## 工具

| 工具 | 做什么 |
|---|---|
| `uml_render` | 模型 → 图源（Mermaid / PlantUML），可指定图族。记号表达不了的视图会被拒绝，并说明理由 |
| `uml_parse` | 图源 → 该图族的模型；不属于状态机/流程的族会按名拒绝，而不是硬当作状态机解析 |
| `uml_review` | 审查建模：结构缺陷、文档缺口、render↔parse 往返一致性；给模型、给图，或两者对照 |
| `uml_explain_labels` | 打印解析器接受的标签与注释契约，不需要图 |
| `model_verify` | 状态机 / 协议的可执行验证（结构检查、对抗性探测、预算、时限、前后回归） |
| `model_compose_verify` | 两台及以上机器的组合检查（死锁、永不发生的会合；声明了共享位置后还有无序写 C4 与非原子更新 C5） |
| `model_datamodel_verify` | 数据模型与迁移验证 |
| `model_interleaving_scan` | 并发 / 同步 / 异步声明的挖掘与路由 |
| `model_export` | 导出到外部检查器（UPPAAL / TLA+ / PRISM / SPIN） |
| `uml_structure_verify` | 依赖图审计（含依赖矩阵与多层级细化）；也可以直接给 `repoPath`，由工具按语言的 import 构造建图（C/C++、Python、TypeScript/JavaScript、Go、Rust、Java/Kotlin/Scala、C#、PHP、Ruby、Lua、Zig、Dart、Elixir） |
| `model_design_review` | 设计审阅：依赖图形状 + 设计自身声明的契约（分层、职责边界、可替换性、接口宽度） |
| `model_automaton_verify` | 有限词自动机：空语言、陷阱状态、可达性，以及与另一台自动机的等价/包含关系；关系不成立时给出**最短反例词** |
| `model_edit` | 按条改动模型文件（加/删状态、加/删/改迁移、指针 set/remove）：返回结构 diff 与发现 diff，一次调用完成「改—验—比」 |
| `report_diff` | 两份报告比对：新增/消失/变化的发现 |

`model_verify`、`model_datamodel_verify`、`model_design_review` 另收 `modelPath`：从工作区里的 JSON 文件读模型，缩进、BOM、尾随换行都不影响。它与内联的 `model` 二选一，两个都给会被拒绝。

## 怎么读报告

工具的产出是一份报告，结论只在 `verdict` 里：**看 `verdict`，不看 `ok`**。`ok` 在各族的含义不同——多数族在评审失败时仍是 `true`，组合族在出现 error 级发现时是 `false`——所以它不能当判定读；把它当判定读，会得出与报告相反的结论。

| 字段 | 说明 |
|---|---|
| `verdict` | 判定：`pass`、`pass_with_findings`、`fail` |
| `verdictReason` | 一句话说明为什么是这个判定 |
| `hashes` | `hashSpec` 与 `modelHash`；前后回归另带 `beforeModelHash`、`afterModelHash`。同一份模型永远得到同一个哈希 |
| `nextSteps` | 引擎建议的下一步 |
| `schema` | 报告的版本化契约，例如 `model-everything/verify/v1`。要按字段分支，就分支在它上面 |
| `truncated` | 搜索撞到上限就停了。**截断不等于通过**，是没结论；某个性质没判定出来时，报告里会出现 `_UNDECIDED` |

默认返回正文。被截断的检查可以单独展开：传 `check: "<id>"`，该检查的全部条目都会打印。要完整结果，传 `reportView: "full"`——紧凑 JSON，对象不丢字段。

`ok` 为 `false` 时判定也是 `fail`，但含义不同：工具根本没跑。原因写在 `errorCode` 里——输入不合法、图族不支持，或声明的 `intent` 服务不了。这类拒绝的 `verdictReason` 以 `the tool did not run:` 开头。

报告怎么读，有一份成体系的说明：[`skills/model-everything-report-reading/`](skills/model-everything-report-reading/) 讲阅读顺序（先看跑没跑、再看判了什么、最后看该做什么）、发现分别放在哪一层、以及两处最容易读反的地方。结构由一个**从真实报告生成的思维导图**给出：[`docs/report-reading/mindmap.mmd`](docs/report-reading/mindmap.mmd)，`tests/report-reading` 会在图与引擎不一致时失败。

`uml_render`、`uml_parse`、`uml_review` 另收一个 `intent`，用来说明这份产物要做什么：给人看（`present`）、要被验证引擎读回（`verify`）、还是要证明渲染与模型一致（`fidelity`）。服务不了这个用途的视图会被直接拒绝，而不是勉强画出来。

## 示例

`examples/` 里是可以直接跑的样本模型，配 [`examples/README.md`](examples/README.md) 说明各自的看点和预期结果。它们是文档，不是测试夹具——各测试套件读自己的 `tests/<套件>/fixtures/`：

- `examples/order-state-machine.before.json` 与 `examples/order-state-machine.after.json`：订单流程的前后两份模型，用来跑前后回归。
- `examples/control-dispatcher.json`：带预算与锁配对的分发状态机，预期零错误。
- `examples/control-dispatcher.overbudget.json`：同一个机器换上更慢的看门狗处理，预期报出一条 `A12_BUDGET_OVER`，并给出最短的超预算路径。
- `examples/ecommerce-data-model.json`，以及 `examples/user-migration.before.json` 与 `examples/user-migration.after.json`：数据模型，和迁移的前后两份。

```bash
model_verify model=examples/control-dispatcher.json
```

## 技能

技能按域拆分，讲的是怎么用、按什么判定：

| 技能 | 覆盖 |
|---|---|
| `model-everything` | 入口：断言清单、核验纪律、深度分级、到各域技能的路由 |
| `model-everything-uml` | UML 图：选哪种视图、标签约定、审查码、往返一致性检查的边界 |
| `model-everything-structure` | 架构与依赖：矩阵怎么写、各条结构检查意味着什么 |
| `model-everything-datamodel` | 数据模型与迁移：不变式（任何时刻都必须成立的约束）、迁移覆盖、回滚对称 |
| `model-everything-design` | 设计自洽：分层是否成立、职责与依赖是否匹配、子类型能否替父类型、接口是否宽于调用方 |
| `model-everything-interleaving` | 并发、同步与异步声明：哪些能证明、用哪个工具证明、哪些只有运行时能看见 |
| `model-everything-report-reading` | 读报告：阅读顺序、发现放在哪一层、容易读反的两处 |

技能描述本身就是路由依据，而它们能写的长度有硬上限（目录行**截断在 500 字符**，之后的部分模型看不到）。谁负责哪个问题、每行必须携带什么，由一张生成的图记录：[`docs/routing-map.md`](docs/routing-map.md)，生成器是 `docs/tools/generate-routing-map.mjs`；`tests/routing-map` 会在图与目录不一致时失败。

## 安装（dsh）

本插件以 cordis bundle 形式提供，声明在仓库根 `package.json` 的 `dsh.bundle` 与 `cordis.patch.yml`。

```bash
# 从源码目录安装（开发中）
dsh plugin --profile <profile> add "file:$PWD"
# 从 npm 安装（发布版）：**钉住版本**
dsh plugin --profile <profile> add dsh-model-everything@<version>
# 未全局安装 dsh 时
npx -p @deepseek-ai/dsh dsh plugin --profile <profile> add dsh-model-everything@<version>
```

**为什么要钉版本**：刚发布的版本，不钉版本会装到上一个。两个原因叠加——镜像源的 `latest` 同步有延迟，而 pnpm 的 `minimumReleaseAge` 会拒收刚发布的版本。钉住版本时 dsh 的安装器会自动把这一条写进 profile 的 `minimumReleaseAgeExclude`，装完用 `--dump-config` 与安装副本的 `package.json` 核对版本。

装完重启该 profile，`dsh --profile <profile> --dump-config` 里应能看到本插件的行。卸载同样走插件管理器，从目标 profile 移除。

技能走 DSH 标准的 filesystem skill provider 注册，工具挂在 `ctx.tools` 上。另有一条模型可见的状态目录条目，可查注册状态与引擎接受的 schema 版本。

### 两个组件

| 组件 | 行 id | 做什么 | 默认 |
|---|---|---|---|
| `dsh-model-everything` | `dsh-model-everything` | 全部工具与技能 | 开 |
| 提示词注入增强 | `dsh-model-everything-gate` | 会话第一条模型步注入一条路由提示 | 开 |

**提示词注入增强**是第二个组件，单独开关。它补的是路由的短板：路由靠技能描述文字，而目录行截断在 500 字符；更要紧的是，一次会话如果压根没决定加载技能，就没有任何东西把它路由过去。

它在每个会话注入一条消息（约 3.2k 字符），内容四块：不确定该查哪个时先加载哪个技能、每个技能管什么、每个工具做什么以及**它不证明什么**、以及怎么读一份报告（`verdict` 而不是 `ok`，`skip` 不是 `pass`）。**那条"先加载技能、别凭记忆回答"的规则在开头说一次、结尾换个说法再说一次**——这是量出来的：只说一次时，那种"觉得自己会答"的请求（迁移）既没加载技能也没用工具；首尾各说一次之后它补上了，而对照任务没有被过度触发。

它的形状借了同一个 harness 里另一个插件往系统提示注入的那一节的三招（那套做法在本环境里已有先例）：

- **只广播装得上的东西**：技能表按 `skills/` 目录里真实存在的技能渲染，所以表里不会出现一个解析不到的技能名；新加技能若还没写行，会退回"see its catalog line"，**可以不全，但不会指错**。
- **选择表而不是一句话清单**：`| 这个请求 | 这个技能 |` 两列，路由本来就是在近义项之间排序，表格比散文更像一道选择。
- **反降级规则**：工具拒绝时读 `errorCode` 改输入再试；工具没装就明说并退回通用方法——**没有任何东西跑过的检查不是通过的检查**。

它怎么工作，四句话：

- **注入点**：`agent/pre-step`，把消息追加到该会话**第一个**模型步的决策里，不是 session-start——后者落进 inbox，可能被空会话的 preset 切换清掉；
- **只注入一次**：消息带自己的 producer source kind，每一步都按会话历史查一次，见到就不再注入；被清掉的话会在下一个能跑的步重新出现；
- **开关**：`enabled` 是 live 字段，插件页翻开关对运行中的 host 立刻生效；`gateContent` 不是 live（一千多字的散文不该进表单），要改写在 profile 的 `cordis.patch.yml` 里；`extraGuidance` 是留给部署自己加一句的追加槽；
- **它只路由**：不检查任何东西，也不会让技能自己加载。

**开关与默认**：默认开。这个默认值是量出来的——它补上的是插件唯一接不住的那类请求，而对照任务没有被过度触发。代价是每个会话约 3.2k 字符；要关掉就改 `cordis.patch.yml`（见下）或翻插件页的开关。想做对照（同一个请求，关一次开一次）也用它。

## 配置

注入组件（默认开）有三个键：

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 是否注入。live 字段：插件页翻开关对运行中的 host 立刻生效，不用重启。 |
| `gateContent` | string | 内置文本 | 注入的全文。替换它等于自己写路由规则；`tests/gate` 仍会要求它点名每个已发布的技能。 |
| `extraGuidance` | string | `""` | 追加在消息最后的一段话，留给部署写自己的规则。 |

主行只有一个 `interaction`（提议调用工具时怎么处置，默认 `follow-approval`）；关掉主行是关掉那一行本身，不是改配置。

按 row id 写进 profile 的 `cordis.patch.yml`：

```yaml
# 按 id 覆盖那一行的 config：整段替换，不做深合并。
# 这里不要写 name——写了 name 是「插入一行」，不是「改这一行」。
- id: dsh-model-everything-gate
  config:
    enabled: false        # 关掉注入
```

## 边界

- **不拥有你的代码。** 只读必要的文件，给出带出处的结论。结论对不对，以源码为准。
- **并发：一半路由，一半判定。** `model_interleaving_scan` 挖出声明并按 family 路由（线程→TSan/Helgrind/CBMC/TLA+，中断→RTOS 感知分析，异步→TLA+/UPPAAL 加运行时检查）。**但共享位置不再只是路由**：把 `shared` 与 `accesses` 交给 `model_compose_verify`，它会判定无序写（C4）与非原子更新/丢更新（C5）——那是一个能在模型上给出最短路见证的决定，不是某个检查的名字。源码级竞争、阻塞调用、漏 `await` 与锁是否跨整个操作持有，仍在路由的另一半。
- **图的审查不等于代码审查。** 图与它声称的模型一致，只说明图画对了。代码是不是这样，还得对着源码核验。

## 环境要求

- 逐版本的安装 / 挂载 / 启动 / 卸载证据在 [DSH-COMPATIBILITY.md](DSH-COMPATIBILITY.md)。
- DeepSeek Harness：准入看 `package.json` 的 `peerDependencies`——插件管理器按它决定装不装得下，`dsh.compatibility.dshReleases` 只是记录实测结论。逐版本兼容性是**实测项**，没实测过的版本一律标 `unknown`。
- Node.js：`>=20`。
- 无 Python 依赖，无网络调用。

## 权限与数据

- 运行时只读包内的 `skills/` 目录（用于注册技能），不读凭据，也不联网。
- 工具只处理你传进来的模型、图与文件路径。报告里只有它算出的结论与哈希。
- 导出到外部检查器（UPPAAL / TLA+ / PRISM / SPIN）时只写你指定的文件。

## 故障排查

- **技能不可见**：确认 DSH 版本支持 `ctx.skills` 与 Agent Skills 发现，并在安装后重启 profile。
- **工具不在**：先查 `enabled`（可能是 `false`），再看插件管理器是否真的装上了（`--dump-config` 里有没有本插件的行）。
- **插件管理器拒绝安装**：确认 `@deepseek-ai/*` 在 `peerDependencies` 里，而不是 `dependencies`。
- **某个图族被拒绝**：这是设计行为。UML 2.5 的十四个图族在本构建里都有实现，所以拒绝永远是关于记号的：记号画不出这个视图，或画得出但读不回来。它按名拒绝并说明理由，不会交出错的模型。

## 开发

```bash
npm install
npm run typecheck     # tsc --noEmit
npm run build         # tsc → lib/（lib/ 必须与 src/ 同步提交）
npm run test:engine   # 全部回归套件，含记忆门禁
npm run test:full     # 端到端合并套件
npm run lint:md       # markdownlint，与 CI 同一个版本
npm run bump -- <x.y.z>          # 同步声明版本
npm run bump -- --check          # 版本一致性
npm run bump -- --audit          # 版本引用审计
```

外部检查器往返（`tests/external/run.mjs`）会调用真实的 `spin` 与 `gcc` 跑一遍导出结果。工具不在 PATH 上时整组自动跳过——跳过不算通过。要指向别处的可执行文件，用两个环境变量：

```bash
MODEL_EVERYTHING_SPIN=/path/to/spin MODEL_EVERYTHING_GCC=/path/to/gcc npm run test:engine
```

插件自己不调用 `spin`、`gcc`、UPPAAL、TLA+ 或 PRISM：`model_export` 只写出它们能读的输入。

约定、目录地图与硬约束见 [AGENTS.md](AGENTS.md)。项目记忆（调研结论、架构决定、交接）的入口在 [.github/memory/MEMORY.md](.github/memory/MEMORY.md)。

想参与：两种来件的结构不同——**有出处的改进**（要引用方法、点名改哪个码、说明是改判定还是加信号，并附最邻近反例与一条能红的变异）与**运行中遇到的问题**（要原样引用报告、给最小复现），分别见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/)。

## 参考文献

各条检查背后的已发表工作——以及哪些检查**没有**已发表来源——收在 [docs/references.md](docs/references.md)。每一条都从仓库里 `Provenance` 表**逐字提取**（生成器 `docs/references/generate.mjs`），并标注它在哪个文件里被引用。这份清单存在的意义是把「已发表方法」与「本仓库自己的约定」分开：多数检查是后者，而把约定当成引用写出来，比说明它是约定更糟。

## 许可证与安全

MIT，见 [LICENSE](LICENSE)。安全策略见 [SECURITY.md](SECURITY.md)。

## 赞助

本插件以 MIT 许可证开源。如果它节省了你的时间，可以在[爱发电](https://afdian.com/a/amethystluna)赞助开发。

赞助完全自愿，不影响许可证，也不改变任何功能。
