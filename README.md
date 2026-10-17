# 设计与代码的建模/自动化审查（dsh-model-everything）

<p align="center"><a href="README.en-US.md">English</a> · <strong>中文</strong></p>

把设计与代码里的断言抽象成模型，交给引擎跑一遍：结论带出处与哈希，能复算、能比对。让结论来自一次运行，而不是一次通盘推理：把「想清楚」变成「跑一遍」。

DeepSeek Harness 原生插件。把设计与代码里**关于行为的断言**变成可运行、可审查、可导出的模型：

- **核验断言**：逐条对着源码检查，引用到 `file:line`。
- **跑模型**：状态机、协议、多机协作、数据模型先建成可执行模型，再交给引擎跑。
- **审图**：UML 图按模型读、按模型审，并与模型对照。
- **对照重构**：重构前后各建一份模型，两份报告摆一起比。
- **留痕**：结论固化成带哈希的报告，可复算、可比对、可导出。

## 能力范围

| 域 | 做什么 |
|---|---|
| 事实核验 | 把一份设计/规格/评审意见里的可验证断言列出来，逐条对着代码核验并给出出处。核不了的直接说明 |
| 行为验证 | 状态机与协议：结构检查、对抗性探测、预算与时限、before/after 回归。多机组合查死锁，以及永不发生的会合（握手事件） |
| 图 | UML 2.5 各图族的渲染、解析与建模审查（含 render→parse 往返一致性对照），覆盖 Mermaid 与 PlantUML 两种记号 |
| 结构 | 组件/包/类/部署图按依赖图审计：孤立节点、悬空引用、环、矩阵与分层违规、缺失的必需边 |
| 数据 | 数据模型与迁移：结构、迁移覆盖、拷贝一致性、回滚对称、前后数据回归 |
| 并发 | 挖掘并发声明（线程安全 / lock-free / ISR 安全…）并路由到能证明它的工具；它自己不证明 |
| 导出 | 已验证模型导出为 UPPAAL / TLA+ / PRISM / SPIN 的输入 |
| 报告 | 报告正文渲染、基线比对（`report_diff`）、哈希规范 |

## 典型用法

### 重构 harness

重构可以改实现，不能改行为。这个判断交给引擎，不必通读 diff：

1. **重构前**：从当前代码抽出 BEFORE 模型（`uml_parse` 读已有的图，或按 schema 手写）。
2. **重构**。
3. **重构后**：抽出 AFTER 模型。
4. **回归**：`model_verify` 带 `beforeModel` 与 `stateMapping` 跑前后回归：行为是否保持、不变式是否连续、状态映射是否自洽。数据侧用 `model_datamodel_verify` 的 `beforeModel` / `fieldMapping` / `migrationMappings` 做同一件事的**数据版**。
5. **判定与留痕**：`report_diff` 拿基线报告比对。新增的 error 发现，就是这次重构不接受的理由。报告里的哈希让结论可复算。

它比较的是**你给的两份模型**，不是两份代码。每份模型是否忠实于对应代码，由第 1、3 步负责，它不代替你做。它也不读 diff、不改代码、不跑你的测试。它回答的是"行为还一样吗"，不是"重构得好不好"。

### 代码流程审查

先把分支逻辑画成流程，再看这张图到底说了什么：

1. **抽流程**：把函数或服务里的分支写成 `LogicModelV1`，或者手画一张 `stateDiagram-v2` / PlantUML 图。
2. **读回模型**：手画的图交给 `uml_parse` 转成模型。读不动的行会变成警告，不会悄悄跳过。
3. **审查**：`uml_review` 报结构缺陷——不可达状态、死端、分支有歧义或没穷尽、自环没有出口、孤立节点、环——以及文档缺口。
4. **落回源码**：每条发现都回到代码核验。图画对了，不等于代码写对了。

它审的是你给的那张图和那份模型。图与代码是否一致，由第 1 步的抽取负责。

### 状态机审查

把状态机建成可执行模型，让引擎去跑，而不是通读代码判断它会不会卡死：

1. **建模型**：手画的 `stateDiagram-v2` 或 PlantUML 状态图交给 `uml_parse`；也可以直接按 schema 写 `LogicModelV1`。
2. **跑检查**：`model_verify` 找的是不可达状态、吸收环、被静默忽略的事件、没有恢复路径的资源申请、预算超限，以及无法满足的时限。每一项都作为一个**带码**的发现报出，而码的前缀说明它属于哪一族。
3. **写清"永远/绝不"**：把这类断言写进 `invariants`，引擎会在全部可达状态上搜反例，并给出它找到的最短路径。
4. **落回源码**：报告里的 error 发现逐条回到代码。

它不证明并发安全，那类声明会被路由到 TSan、CBMC 或 TLA+；硬实时语义（deadline、period）也不在它的范围内。

### 审计一张依赖图

组件图是关于「哪些模块可以依赖哪些」的断言。把它当图读，再问那些边是否被允许：

1. **给图**：PlantUML 的组件/包/类/部署图源码，或 Mermaid 类图。`uml_structure_verify` 把它解析成节点与边。
2. **说清什么被允许**（如果有规则）：一个含 `layers` 与 `rules` 的矩阵，每条规则点名一个 `source` 并给 `allow` / `deny` / `require`，再用 `default` 管其余。没有矩阵时，它只报结构缺陷。
3. **读发现**：孤立节点、从未声明过的端点、带最短路径的环、越过层的边、缺失的必需边，以及——一个节点都没声明时——**这份输入没有任何可审的东西**。
4. **换一种图就换个工具**：如果这张图是状态图或活动图，那是 `uml_review`，不是它。

它审的是**图**，不是代码。一张自洽的图仍可能画错了系统，所以要和源码侧扫描配对。手画的图报「标签漂移」时，`uml_explain_labels` 会打印该记号下解析器接受的标签写法。

### 让设计对自己作出的声明负责

设计会对自己作出断言：这一层在那层之上、这个组件拥有那条依赖、这个接口比它的调用方窄。`model_design_review` 判定设计是否守住了这些承诺：

1. **把设计写成模型**：架构（节点与边），加上它声明的——分层、边界、允许与必需的边、带职责的类型、操作、转移、父类型。
2. **跑它**：`model_design_review` 报出设计与自相矛盾的地方，并**另外**报出它图的形状——环与打断环所需的最少边、承重元素、层级、扇入扇出。
3. **读那三个列表**：`violations` 决定判定；`signals` 值得一看但不使任何东西失败；`facts` 是**测量**，不是发现。`checksSkipped` 说明哪些原则因为**没声明任何可对照的东西**而没有检查。

**它从不按外部标准评判设计。** 它报的是：设计**与它自己声明的某件事**矛盾，或关于它的图的一个结构事实。问「这个设计好不好」是评审者的问题；这个工具回答的是另一个：**它就自己的说法而言，站得住吗**。

### 两台必须互相配合的机器

一台机器**不会因为另一台**而死锁。当两个组件握手时，真正有意思的失败在**组合**里：

1. **各自建模**，然后一起给：`model_compose_verify` 收一个模型数组。
2. **点名共享事件**：如果一个握手只有在双方都就绪时才合法，把它写进 `rendezvous`。没写进去的事件只推进一台机器，所以等握手的机器可以先走任意多步自己的路。
3. **读 C1 与 C2**：一个可达节点上没有任何机器能前进、且有机器不是终止态（C1），以及一个**永远不会触发**的会合（C2）。两者都逐机给出理由，C1 还给最短反例。

模型里**没有速率比，也没有公平性约束**。单台机器自己的问题——不可达状态、不变式、成本对预算——用 `model_verify`。

### 并发声明：挖掘并路由

「线程安全」「lock-free」「ISR 安全」都是需要某个能判定它们的工具的断言，而第一步是**把它们找出来**：

1. **扫文本**：`model_concurrency_scan` 收文档、计划或笔记，报出风险点——那条声明、共享状态、中断、临界区。
2. **看每条绝对声明欠着什么**：「不可能有数据竞争」这类声明会被报为 error，要求**专门的**验证，且每条发现都点名能判定它的分析——竞争用 TSan 或 Helgrind，有界证明用 CBMC，协议用 TLA+，中断用 RTOS 感知的分析。
3. **去做那个分析**：本插件不运行它，也不对并发安全作任何证明。

它读的是**文本**。它看不见你的线程，而**一次干净的扫描不是健康证明**——它的含义是没找到声明，这是另一个命题。

### 一次迁移：前后两份模型

迁移是两份模型，加一个「数据活下来了」的断言。把两份都给出去，这个断言就变成可核查的：

1. **两份模型**：改动前的 schema 与改动后的 schema，各自是含实体、字段、键与关系的数据模型。
2. **说清字段怎么走**：`fieldMapping` 从旧路径到新路径，加上 `migrationMappings`——用于来源不是它自己旧名字的字段。
3. **跑比对**：`model_datamodel_verify` 带 `beforeModel`，检查迁移覆盖、拷贝一致性、回滚对称，以及前后数据回归。
4. **读那条警告**：新 schema 里声明为 `required`、却没有任何东西供给它的字段，会报 `DS2_REQUIRED_FIELD_UNSOURCED`。它是 **warning**，所以判定停在 `pass_with_findings`——**这是一个要做的决定，不是引擎可以替你宣布的失败**。

它比较的是**你给的两份模型**。任一份是否忠实于它所描述的数据库，是抽取那一步的事，这个工具不做。

### 图的导入与导出：设计冻结与长期迭代

这里存的是**源文件**，不是截图：`uml_render` 写出 Mermaid / PlantUML 源，`uml_parse` 把源读回模型。一份图因此能当两种东西用：

- **设计冻结的留档**：把图源、模型和那一次的验证报告一起提交进仓库，作为某个时间点的设计记录。模型里可以放 `_` 前缀的元数据（单据号、日期、负责人、抽取时留下的保留意见），这些键不参与哈希，补档案信息不会改变结论的身份。
- **长期迭代的参考**：下一次改动时重新抽出模型、重跑验证，再用 `report_diff` 与冻结的那份报告比对。新增的 error 是这次改动引入的，消失的说明旧问题已经解决；哈希让"还是不是同一份模型"可判定，不必肉眼比图。

需要交给外部检查器时，同一份模型可以用 `model_export` 导出成 UPPAAL / TLA+ / PRISM / SPIN 的原生输入。

界线：它保存并比对的是**模型与图的源文件**，渲染出来的图片只是副产品。图变了模型没变、或模型变了图没变，都会在下一次解析或比对时暴露。

## 工具

| 工具 | 做什么 |
|---|---|
| `uml_render` | 模型 → 图源（Mermaid / PlantUML），可指定图族。记号表达不了的视图会被拒绝，并说明理由 |
| `uml_parse` | 图源 → 该图族的模型；不属于状态机/流程的族会按名拒绝，而不是硬当作状态机解析 |
| `uml_review` | 审查建模：结构缺陷、文档缺口、render↔parse 往返一致性；给模型、给图，或两者对照 |
| `uml_explain_labels` | 打印解析器接受的标签与注释契约，不需要图 |
| `model_verify` | 状态机 / 协议的可执行验证（结构检查、对抗性探测、预算、时限、前后回归） |
| `model_compose_verify` | 两台及以上机器的组合检查（死锁、永不发生的会合） |
| `model_datamodel_verify` | 数据模型与迁移验证 |
| `model_concurrency_scan` | 并发声明的挖掘与路由 |
| `model_export` | 导出到外部检查器（UPPAAL / TLA+ / PRISM / SPIN） |
| `uml_structure_verify` | 依赖图审计（含依赖矩阵与多层级细化） |
| `model_design_review` | 设计审阅：依赖图形状 + 设计自身声明的契约（分层、职责边界、可替换性、接口宽度） |
| `report_diff` | 两份报告比对：新增/消失/变化的发现 |

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

默认返回正文。要完整 JSON，传 `reportView: "full"`。

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
| `model-everything-concurrency` | 并发声明：哪些能证明、用哪个工具证明 |
| `model-everything-report-reading` | 读报告：阅读顺序、发现放在哪一层、容易读反的两处 |

技能描述本身就是路由依据，而它们能写的长度有硬上限（目录行**截断在 500 字符**，之后的部分模型看不到）。谁负责哪个问题、每行必须携带什么，由一张生成的图记录：[`docs/routing-map.md`](docs/routing-map.md)，生成器是 `docs/tools/generate-routing-map.mjs`；`tests/routing-map` 会在图与目录不一致时失败。

## 安装（dsh）

本插件以 cordis bundle 形式提供，声明在仓库根 `package.json` 的 `dsh.bundle` 与 `cordis.patch.yml`。

```bash
# 从源码目录安装（开发中）
dsh plugin --profile <profile> add "file:$PWD"
# 发布后从 npm 安装
dsh plugin --profile <profile> add dsh-model-everything
# 未全局安装 dsh 时
npx -p @deepseek-ai/dsh dsh plugin --profile <profile> add dsh-model-everything
```

装完重启该 profile，`dsh --profile <profile> --dump-config` 里应能看到本插件的行。卸载同样走插件管理器，从目标 profile 移除。

技能走 DSH 标准的 filesystem skill provider 注册，工具挂在 `ctx.tools` 上。另有一条模型可见的状态目录条目，可查注册状态与引擎接受的 schema 版本。

## 配置

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 是否注册本插件的工具。 |

在 profile 的 `cordis.patch.yml` 里按 row id 覆盖：

```yaml
- insert:
    - id: dsh-model-everything
      name: 'dsh-model-everything'
      config:
        enabled: false
```

## 边界

- **不拥有你的代码。** 只读必要的文件，给出带出处的结论。结论对不对，以源码为准。
- **并发只做路由。** `model_concurrency_scan` 找出并发声明，并指出该由哪个工具证明。证明本身不归它做。
- **图的审查不等于代码审查。** 图与它声称的模型一致，只说明图画对了。代码是不是这样，还得对着源码核验。

## 环境要求

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
