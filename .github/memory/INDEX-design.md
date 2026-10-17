---
name: INDEX-design
description: 架构决定与契约——语法引擎、工具面、模型与报告（二级索引）
metadata:
  type: index
---

# 架构决定与契约（design）

> 上级：[MEMORY.md](MEMORY.md)　·　什么时候读：改引擎表、加图族、动工具面或报告 schema 之前

| 主题 | 一句话 | 什么时候读 |
|---|---|---|
| [store-entry](design/store-entry.md) | 商店条目注册草稿：名称、中英描述、分类，以及文案为什么这么排 | 注册创意工坊条目、改卡片文案或调整分类时 |
| [gate-injection](design/gate-injection.md) | 会话开头路由注入：第二个 loader 行、默认开是怎么定的、它替代不了什么、代价与「文档即指引」原则的关系、从 a neighbouring plugin 借的三种写法 | 动 `src/gate.ts`、改注入文本或开关、判断「要不要开这条消息」时 |
| [architecture](design/architecture.md) | 记号语法引擎（记号表 / 图族表 / 能力矩阵）、图族模块契约、工具面按职责拆分与开闭点、schema 与命名约定、仅 dsh 的边界 | 加一个图族、改检测或能力判定、动工具参数与描述之前 |
| [plugin-dev-spec](design/plugin-dev-spec.md) | dsh 插件开发规范的实测结论：bundle 与 patch 语义、一包多组件、配置 schema、技能注册、模型可见目录、商店元数据与 release 实测办法 | 改 cordis.patch.yml、动 package.json 的 dsh 块、加组件、动技能注册或 inspect provider、做发布挂载之前 |
| [uml-check-coverage](design/uml-check-coverage.md) | UML 检查码的覆盖与编号：每条规范约束落在哪个模块、是实现了还是按设计拒绝，以及用例族与多层级复用同一段号码这一处编号冲突 | 报出或读到一个 `UML0xx` 码、判断哪个图族的哪些缺陷根本没检查、或想动检查码编号时 |
| [design-review](design/design-review.md) | 设计审阅引擎（DES1-DES11）：三级发现（violation／signal／fact）、每码判据与所需词汇、可判与不可判的边界、原则出处，以及为什么不做社区发现与模块度 | 读到一个 `DES*` 码、判断某个设计原则能否被判定、或想给审阅加一条设计判据之前 |
| [robustness-audit](design/robustness-audit.md) | 异常/非法输入专项审查的结论：以「拼错的名称静默关掉检查、再报正面全部通过」为主的一族缺陷、D1-D12 逐条位置、审查者未能判定的模糊点与覆盖缺口、按严重度的修复计划 | 修任何一条引擎的校验/引用解析、判断某个 `pass` 是否可信、或给引擎加新的声明式字段之前 |
| [deployed-surface](design/deployed-surface.md) | 只在装进 profile 实跑时才现形的缺陷族：两种拒绝形状（`ran: true` 无 `errorCode` 的那种）与解读技能的说法冲突、并发扫描与跨族 diff 的静默通过、验证部署面的办法 | 判断一个 `pass` 是不是「其实什么都没看」、查「已解决」的 diff 可不可信、或装进 profile 验证改动时 |
