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
| [architecture](design/architecture.md) | 记号语法引擎（记号表 / 图族表 / 能力矩阵）、图族模块契约、工具面按职责拆分与开闭点、schema 与命名约定、仅 dsh 的边界 | 加一个图族、改检测或能力判定、动工具参数与描述之前 |
| [plugin-dev-spec](design/plugin-dev-spec.md) | dsh 插件开发规范的实测结论：bundle 与 patch 语义、一包多组件、配置 schema、技能注册、模型可见目录、商店元数据与 release 实测办法 | 改 cordis.patch.yml、动 package.json 的 dsh 块、加组件、动技能注册或 inspect provider、做发布挂载之前 |
| [uml-check-coverage](design/uml-check-coverage.md) | UML 检查码的覆盖与编号：每条规范约束落在哪个模块、是实现了还是按设计拒绝，以及用例族与多层级复用同一段号码这一处编号冲突 | 报出或读到一个 `UML0xx` 码、判断哪个图族的哪些缺陷根本没检查、或想动检查码编号时 |
