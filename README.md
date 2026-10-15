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
4. **回归**：`model_verify` 带 `beforeModel` 与 `stateMapping` 跑 D1–D4，检查行为是否保持、不变式是否连续、状态映射是否自洽。数据侧用 `model_datamodel_verify` 的 `beforeModel` / `fieldMapping` / `migrationMappings` 跑 DD1–DD4。
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
2. **跑检查**：`model_verify` 跑 S1–S8 结构检查与 A1–A14 对抗性探测——不可达状态、吸收环、事件被静默忽略、资源申请没有恢复路径、预算超限、时限无法满足。
3. **写清"永远/绝不"**：把这类断言写进 `invariants`，引擎会在全部可达状态上搜反例，并给出它找到的最短路径。
4. **落回源码**：报告里的 error 发现逐条回到代码。

它不证明并发安全，那类声明会被路由到 TSan、CBMC 或 TLA+；硬实时语义（deadline、period）也不在它的范围内。

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
| `report_diff` | 两份报告比对：新增/消失/变化的发现 |

## 怎么读报告

工具的产出是一份报告，结论只在 `verdict` 里：**看 `verdict`，不看 `ok`**。`ok` 只表示工具跑过了。

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

`uml_render`、`uml_parse`、`uml_review` 另收一个 `intent`，用来说明这份产物要做什么：给人看（`present`）、要被验证引擎读回（`verify`）、还是要证明渲染与模型一致（`fidelity`）。服务不了这个用途的视图会被直接拒绝，而不是勉强画出来。

## 示例

`examples/` 里是可以直接跑的样本模型，配 [`examples/README.md`](examples/README.md) 说明各自的看点和预期结果：

- `examples/order-state-machine.before.json` 与 `examples/order-state-machine.after.json`：订单流程的前后两份模型，用来跑 D1–D4 回归。
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
| `model-everything-concurrency` | 并发声明：哪些能证明、用哪个工具证明 |

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

- DeepSeek Harness：见 `package.json` 的 `dsh.compatibility`。逐版本兼容性是**实测项**。没实测过的版本一律标 `unknown`。
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
- **某个图族被拒绝**：这是设计行为。记号表达不了，或本构建还没有该族模块时，它按名拒绝并说明理由，不会交出错的模型。

## 开发

```bash
npm install
npm run typecheck     # tsc --noEmit
npm run build         # tsc → lib/（lib/ 必须与 src/ 同步提交）
npm run test:engine   # 全部回归套件，含记忆门禁
npm run test:full     # 端到端合并套件
npm run bump -- <x.y.z>          # 同步声明版本
npm run bump -- --check          # 版本一致性
npm run bump -- --audit          # 版本引用审计
```

约定、目录地图与硬约束见 [AGENTS.md](AGENTS.md)。项目记忆（调研结论、架构决定、交接）的入口在 [.github/memory/MEMORY.md](.github/memory/MEMORY.md)。

## 许可证与安全

MIT，见 [LICENSE](LICENSE)。安全策略见 [SECURITY.md](SECURITY.md)。
