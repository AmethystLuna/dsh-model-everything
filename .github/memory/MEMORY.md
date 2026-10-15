---
name: MEMORY
description: 项目记忆的二级索引根：分类表、用法与维护规则
metadata:
  type: index
---

# 项目记忆（二级索引根）

`.github/memory/` 放调研结论、架构决定与历史交接。`AGENTS.md` 里的项目地图、命令与硬约束不在这里重复。

**怎么用**：先在本表选一个分类，再打开对应的 `INDEX-<分类>.md` 看主题清单，最后只读需要的那一两篇。不必一次读整个目录。

两级索引各管一段：本表答「去哪一类找」，分类索引答「读哪一篇」，正文在主题文件里。正文语言随素材，索引行会注明哪几篇是英文。

| 分类 | 二级索引 | 覆盖 | 什么时候读 |
|---|---|---|---|
| research | [INDEX-research.md](INDEX-research.md) | 记号覆盖与审查清单的调研结论 | 要判断某个图族能不能画、能不能读，或为某个图族定检查项时 |
| design | [INDEX-design.md](INDEX-design.md) | 架构决定与契约：语法引擎、工具面、模型与报告 | 改引擎表、加图族、动工具面或报告 schema 之前 |
| history | [INDEX-history.md](INDEX-history.md) | 交接与沿革 | 接手这个仓库，或想知道某个决定、某个文件的来历 |

## 维护规则

1. 新增主题文件后，必须在对应的 `INDEX-<分类>.md` 里加一行。游离文件会让 `tests/memory/run.mjs` 变红。
2. 索引行的「一句话」要和该文件 frontmatter 的 `description` 意思一致。改主题时两处一起改。
3. 每个主题文件都要有 frontmatter（`name` / `description` / `metadata.type`）。分类由磁盘推导（扫 `INDEX-*.md`），没有硬编码的分类清单。
4. 正文写「是什么、为什么、怎么用」。结论要落到文件、函数或检查码上，不写转述过的印象。
5. 记忆里不写本机绝对路径、账号、令牌或第三方私有项目名。来源只写公开 URL，引用只引公开规范与文档。
6. 待办清单（`history/open-work.md`）里做完的条目**就地删掉**，别留成历史；被否决的条目先写成一句结论放进 `design/`，再从清单里删。
