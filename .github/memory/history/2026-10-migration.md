---
name: 2026-10-migration
description: 本仓库的来历与那次会话交接：从哪个仓库迁来、搬了什么、拆掉了什么、验证程度、留给后续会话的事
metadata:
  type: project
---

# 交接 · 2026-10 迁移（从 dsh-logicprobe 到本仓库）

## 结论先说

本仓库承接 `dsh-logicprobe` 的全部工具能力，且**只服务 dsh**。能力全在这里，命名全部重来。仓库的来历，就是这份笔记。

## 搬了什么

| 域 | 内容 |
|---|---|
| 图 | UML 14 族：记号语法引擎、图族表与能力矩阵、用例族模块、结构族模块（class·object·package·component·deployment）、状态机/活动/顺序三视图 |
| 行为验证 | `model_verify`（S1-S8 / A1-A14 / D1-D4）、`model_compose_verify`（C1/C2）、`model_export`（UPPAAL / TLA+ / PRISM / SPIN） |
| 数据 | `model_datamodel_verify`（DS / DA / DD） |
| 并发 | `model_concurrency_scan`（挖声明并路由，不证明） |
| 结构 | `uml_structure_verify`（UML020-UML026 + 依赖矩阵）、多层级审查（UML028-UML031） |
| 报告 | 报告正文渲染、`report_diff`、baseline 比对、哈希规范 |

## 本仓库的边界

下面四条都是有意选的，不是将就：

| 边界 | 理由 |
|---|---|
| 引导只有一处：工具描述与技能正文 | 模型读描述决定要不要用。纪律与判据写在技能里，谁需要谁读 |
| 安装面只有 dsh 这一个 bundle | 技能走标准 filesystem provider，工具挂 `ctx.tools`。只有一种分发形态 |
| 引擎只有 TypeScript 一份 | 报告、组合与导出只有一条实现路径，测试直接对着它跑 |
| 配置面只有 `enabled` | 能少一个开关就少一个 |

## 命名（一次性决定）

- 包与仓库：`dsh-model-everything`（中性名，避免验证能力被 UML 之名窄化）。
- 工具：`uml_render` / `uml_parse` / `uml_review` / `uml_explain_labels` / `model_verify` / `model_datamodel_verify` / `model_compose_verify` / `model_concurrency_scan` / `model_export` / `uml_structure_verify` / `report_diff`（共 11 个）。
- schema 前缀 `model-everything/…`；指令命名空间 `dsh-model-everything:`；skills 目录名 `model-everything{,-uml,-structure,-datamodel,-concurrency}`。

## 验证到什么程度

- `npm run test:engine`：整套回归全绿，含记忆门禁与外部检查器往返（检查器不在 PATH 上时自动跳过）。
- 工具入口检查覆盖四个 UML 工具各自的参数与拒绝码，包括「`uml_explain_labels` 不提供 `intent`」。
- 图族能力有测试对着拒绝消息与模型逐字比对；结构族的往返一致性由能力矩阵与测试共同钉住。
- **未验证**：`dsh.compatibility.dshReleases` 的每一条都标 `unknown`（未实测）；插件尚未装进任何 profile；npm 发布与 GitHub 建仓未做。

## 源仓库那一侧（已做）

在 `dsh-logicprobe` 的发行点（v1.4.0）上新开一个修复分支，只重放一处必要修复：无关键字的用例语法（`:Actor: --> (UseCase)`、`(UseCase) as (U)`、纯 `:Actor:`）与 Mermaid 的 `usecase-beta` 一律**按名拒绝**，拒绝码 `UML_NOT_A_STATE_DIAGRAM`，消息里点名该图族与本插件。这条规则也在另一份实现里落地，两份 README 各加指向说明。迁移过程中用过的分支未合并，现已移除。

## 留给后续会话

还没做完的事都记在[待办清单](open-work.md)，这里不再重复一份。
