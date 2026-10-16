---
name: skill-routing-measurement
description: 技能路由的实测结果、方法与它测不到的东西——技能描述与工具描述的文字分配是否真的引导了选择
metadata:
  type: research
---

# 技能路由：怎么测的，测出了什么，测不到什么

**要回答的问题**：不通过 hook 注入，只靠**技能描述与工具描述里的文字**，模型能不能选中正确的技能？

## 结论（2026-10-17 实测）

对 `tests/skill-routing/corpus.json` 的全部 **93 条**用例，独立作答 **93/93 全对**，七个族无一失分：

| 族 | 得分 | 该族当时是否已测过 |
|---|---|---|
| `model-everything` | 15/15 | 是（旧语料） |
| `model-everything-concurrency` | 9/9 | 是 |
| `model-everything-datamodel` | 16/16 | 是 |
| `model-everything-uml` | 16/16 | 是 |
| `model-everything-structure` | 16/16 | 是 |
| `model-everything-design` | 10/10 | **否，本次首测** |
| `model-everything-report-reading` | 11/11 | **否，本次首测** |

## 方法（必须照做，否则数字没有意义）

1. `node tests/skill-routing/run.mjs --print-prompt` 打印**自足**提问：目录原文（模型实际看到的那份）+ 编号请求，**不含任何预期答案**。
2. 把提问交给一个**独立子代理**，明确要求：只读该文件、**不得读仓库任何其他文件**（语料、测试、答案都不许看）。
3. 子代理只回一个 JSON 对象 `{"<下标>": "<技能名>"}`。
4. `node tests/skill-routing/run.mjs --decisions <file>` 评分。

**为什么必须独立**：自问自答测的是「文本能不能被我读懂」，不是「文本能不能被读懂」。

## 这个数字**测不到**什么

- **它测的是「目录文本足以判定这 93 条」，不是「任意输入都能路由对」。** 语料是人写的，100% 的含义是「描述区分开了语料里构造的边界」，不是「描述无法被误读」。
- **它不测独立于作者的程度**：作者与作答者同源，所以「读法是否唯一」没有被独立验证。要真测，需要换一个模型族作答。
- **历史语料上的 100% 不能直接引用**：语料随技能增加而变长变序。存档答案按下标编号，语料一动下标就错位——`decisions-perfect.json` 对它自己的提交是 45/45，对今天的语料是 33/93，**这不是路由退化，是对齐失效**。跨时间比较必须**按用例文本**重映射（下标不可用）。

## 守住它的东西

| 机制 | 守什么 |
|---|---|
| `tests/skill-routing/run.mjs`（结构性一半，进 `test:engine`） | 每条用例点名一个**已发布**技能；每个技能至少是一处触发、一处近似误路由；用例依赖的词必须在**可见的 500 字符预算**内 |
| `tests/routing-map/run.mjs` | 路由图必须等于**当前**目录生成的图（加技能后忘重新生成会红） |
| `tests/catalog/run.mjs` | 每行开头是触发句、点名兄弟、有范围声明；不许有脆弱计数 |

## 一次真实的漂移（值得记住）

路由图当初**提交进 `docs/` 却没有漂移测试**。后来加了报告解读技能，图仍停在六个技能——**生成物没有测试就是一份会悄悄变假的快照**。现已补 `tests/routing-map/`，并复现了那次漂移（测试红了，重新生成后才绿）。

同类的第二次：报告解读技能的描述里我写了「one element makes **two** checks inseparable」，被 `tests/skills` 的脆弱计数检查抓住，改成不带数字的说法。

## 相关

- 图与文字分配：[routing-map](../../../docs/routing-map.md)（由 `docs/tools/generate-routing-map.mjs` 从目录 + 语料 + 工具定义生成）
- 报告解读的方法与图：[report-reading](../../../docs/report-reading/guide.md)
