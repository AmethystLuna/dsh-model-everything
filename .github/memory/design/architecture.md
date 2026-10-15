---
name: architecture
description: 记号语法引擎、图族模块契约、工具面拆分与开闭点、schema 与命名约定、仅 dsh 的边界
metadata:
  type: project
---

# 架构（语法引擎 · 图族模块 · 工具面）

## 1. 记号语法引擎：`src/uml-syntax.ts`

这里集中回答三件事：两种记号（Mermaid / PlantUML）各自能拼什么，一段文本属于哪个 UML 图族，某个「记号 × 图族 × 动作」格子是否存在。

| 部件 | 内容 |
|---|---|
| 记号表 | 注释前缀、头部关键字、chrome（渲染器要、读者不要的行）、边运算符 |
| 图族表 `UML_FAMILIES` | UML 2.5 全部 14 类图：`id` / 中英文名 / `group`（structure·behaviour·interaction）/ `machine`（解析结果是可执行 LogicModelV1 吗）/ `parseable` / 每种记号的 `fidelity` 与 `note` |
| 能力判定 `umlCapability` | `faithful` → 可渲染可解析；`approximate` → 只渲染（附警告），解析会得到「另一种图」，所以拒绝；`none` → 拒绝并给出理由。拒绝码：`UML_VIEW_UNREPRESENTABLE` / `UML_NOT_A_STATE_DIAGRAM` / `UML_INPUT` |
| 检测 `detectUmlFamily` | **全函数**：每条分支要么给出图族，要么按名拒绝，绝不落到另一个族的解析器。历史缺陷：`:User: --> (Login)` 曾被当成状态机，而且没有任何发现 |
| 词法原语 | `dsh-model-everything:` 指令读写、内容行扫描、边切分、id/标签规则、`UmlError` |

新增一个图族 = 在图族表加一条 + 写一个模块。能力矩阵与检测顺序都由表驱动。

## 2. 图族模块契约：`UmlFamilyModule`

```ts
interface UmlFamilyModule<Model> {
  id: UmlFamilyId
  render(input, notation, options): { primary, warnings }
  parse(text, notation): { model, labels, warnings, discardedConstructs, discardedEdges }
  review?(model, labels, notation): UmlFamilyFinding[]
}
```

- 已在册：`use-case`（`src/uml-usecase.ts`）、`class` / `object` / `package` / `component` / `deployment`（`src/uml-structure.ts`，五个族共用一个工厂，差别只在词汇）。
- 机器族（state / activity / sequence）不走模块契约，保留 `src/uml.ts` 里的原有路径；能力矩阵对它们的判定与模块族一致。
- 表里 `faithful` 但本构建尚无模块的族，由注册表按名拒绝（消息里点名图族与证据），不交给错的解析器。

## 3. 模型与报告

| 模型 | 说明 |
|---|---|
| `LogicModelV1` | 可执行状态机/流程；`model_verify`、`model_compose_verify`、`model_export` 的输入 |
| `UseCaseModelV1` | 参与者、用例、subject、association / include / extend / generalization |
| `StructureModelV1` | `family` + 节点（`kind` / `label` / `parent`）+ 边；解析与审查复用 `src/structure.ts`，只有一份图解析器 |
| `UmlFamilyModel` | 上面三者的联合；`uml_parse` 结果带 `family` 字段 |

- 哈希：`valueHash`（任意模型对象，同一套规范化：丢 `_` 前缀元数据 + 稳定序列化）。
- 报告契约 `REPORT_SCHEMAS`：前缀 `model-everything/…`（如 `model-everything/uml/review/v1`）。读报告只看 `verdict`，不看 `ok`。
- 指令命名空间：`dsh-model-everything:`（渲染出的图里用它钉住记号无法表达的 id / 种类 / 父容器）。

## 4. 工具面：一职责一工具，开闭在图族表

| 工具 | 职责 |
|---|---|
| `uml_render` | 模型 → 图源（按 `kind` 选族，按 `notation` 选记号） |
| `uml_parse` | 图源 → 该族模型 |
| `uml_review` | 审查建模：结构缺陷、文档缺口、render↔parse 往返一致性；给模型、给图、或两者对照 |
| `uml_explain_labels` | 打印解析器接受的标签/注释契约（不需图，也不服务任何 `intent`） |
| `model_verify` / `model_datamodel_verify` / `model_compose_verify` / `model_concurrency_scan` / `model_export` / `uml_structure_verify` / `report_diff` | 行为验证、数据模型与迁移、多机组合、并发声明路由、外部检查器导出、依赖图审计、报告比对 |

拆分原则（这是决定，不是偏好）：

1. **单一职责**：一个工具只做一件事，只收它需要的参数。`uml_parse` 没有 `model`/`kind`；`uml_explain_labels` 连 `intent` 都没有。labels 不服务任何意图，给它这个参数，等于开一个必然被拒的入口。
2. **开闭**：`kind` 枚举由 `[...UML_DIAGRAMS]` 从引擎读出。加图族 = 引擎表 + 模块，工具 schema、描述、测试清单都不动。
3. **描述即引导**：模型靠工具描述与技能正文决定要不要用、怎么用。因此每个工具的 description 必须自足：它做什么、给什么、拒绝什么、读哪个字段做判断。

## 5. 边界

- 引导只有一处：工具描述与技能正文。插件不向会话写入任何文本。
- 分发面就是这一个 bundle。引擎只有 TypeScript 一份实现，测试直接对着它跑。
- 报告 schema 与字段是稳定契约，跨会话可比对（`report_diff`）。
- 兼容性（`dsh.compatibility.dshReleases`）是**实测**项，未实测的版本标 `unknown`。
