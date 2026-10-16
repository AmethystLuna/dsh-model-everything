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
- **未验证**：插件尚未装进任何**长期使用的** profile；npm 发布与 GitHub 建仓未做。

## 迁移之后补测的（2026-10 下半月）

- **兼容性是实测的**：在隔离 `DSH_HOME` 里用 `dsh 0.2.0-rc.2` 装 `file:` 副本，`--dump-config` 里看到本插件的行（`enabled: true`），技能与 `locale/` 都在包内。0.1.7 那一段另用 API 面探针（装该版本的 `dsh-tools`/`dsh-llm`/`dsh-skill-filesystem`，把 `lib/` 放进去跑 `apply`）测过 `0.1.7-alpha.2`、`0.1.7-rc.1`、`0.1.7-rc.2`：工具全注册、工具能跑出报告、inspect 与技能 provider 都建得起来。
- **区间内十个发行版全部实测通过（2026-10-16）**：`0.1.7-alpha.2`、`0.1.7-rc.1`、`0.1.7-rc.2`、`0.2.0-rc.1`、`0.2.0-rc.2`、`0.2.1-alpha.1` 至 `0.2.1-alpha.5`。做法是把轮次脚本再包一层：registry 装 `@deepseek-ai/dsh@<版本>` 到隔离树（每棵约 60–80 秒），再跑六步轮次。十个全绿，于是 `dshReleases` 里**不再有 `unknown`**。
  为什么用 registry 装的树而不是本地那份 `deepseek-harness` monorepo 源码构建：被测量的是**发布的产物**，而 `file:` 安装消费的正是 npm 包；monorepo 构建出的是开发态 CLI，与 `npm publish` 出去的东西不是同一个对象，混用会让「实测」这句话变味。本地 clone 仍有用处——它是查上游发了哪些版本、以及核对 tag 与 registry 是否同步的权威。
- **兼容性轮次有了可复用的测试台（2026-10-16）**：`0.2.1-alpha.1` 用一套六步轮次实测——装 → `--dump-config` 看到行 → 技能与 `locale/` 在包内 → headless 带假 key 启动（止步 AUTH 即说明整棵插件树加载通过）→ **从装好的副本跑出真实报告** → 卸载后行消失。脚本是 scratch 区里 `model-everything-mount` 任务目录下的 `compat-round.ps1`（改编自 logicprobe 那份：插件参数化，并多了「真实报告」这一步），同目录另有 `sweep-versions.ps1` 遍历多个版本。这一步有两个只属于 `file:` 安装的坑：pnpm 装进来的副本**没有自己的 `node_modules`**，且它的 `peerDependencies` 由**宿主的 loader 树**解析，普通 `import` 查不到——所以探针要从 dsh 树里跑，并用一个临时 junction 把 `@deepseek-ai/*` 借给副本，跑完就摘掉。
- **准入只看 `peerDependencies`**：`dsh.engines.dsh`、`dsh.category`、`dsh.displayName`、`dsh.compatibility` 都没有读者；区间不放宽就会被插件管理器拒装。细节见[插件开发规范](../design/plugin-dev-spec.md)。
- **卡片标题来自 `locale/*.json` 的 `meta.title`**，原先 `package.json` 里那个 `./locale/*.json` export 没有对应文件，卡片因此拿不到名字；现在 `locale/en.json` 与 `locale/zh.json` 都在，并已进 `files`。

## 源仓库那一侧（已做）

在 `dsh-logicprobe` 的发行点（v1.4.0）上新开一个修复分支，只重放一处必要修复：无关键字的用例语法（`:Actor: --> (UseCase)`、`(UseCase) as (U)`、纯 `:Actor:`）与 Mermaid 的 `usecase-beta` 一律**按名拒绝**，拒绝码 `UML_NOT_A_STATE_DIAGRAM`，消息里点名该图族与本插件。这条规则也在另一份实现里落地，两份 README 各加指向说明。迁移过程中用过的分支未合并，现已移除。

## 留给后续会话

还没做完的事都记在[待办清单](open-work.md)，这里不再重复一份。
