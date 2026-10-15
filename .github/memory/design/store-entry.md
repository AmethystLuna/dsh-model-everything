---
name: store-entry
description: 商店条目注册草稿：名称、中英描述与分类，注册时照抄；也记了文案为什么这么写
metadata:
  type: project
---

# 商店条目注册草稿

社区索引（`community.json`）是创意工坊商店目录与 dsh-market.com 清单的唯一来源。橱窗里显示的是**这里的字段**，不是 npm 包名。注册时按本表填。

| 字段 | 内容 |
|---|---|
| `id` | `dsh-model-everything` |
| `npm` | `dsh-model-everything` |
| `name` | 设计与代码的建模/自动化审查 |
| `nameEn` | Modeling / Automated Review for Designs and Code |
| `author` | Amethyst Luna |
| `repo` | https://github.com/AmethystLuna/dsh-model-everything |
| `category` / `subcategory` | `tools/dev` / `review` |
| `description` | 自动化审查替代反复试错——省下的 token，留给设计。文档与源码交叉验证；行为与流程建模核查。 |
| `descriptionEn` | Automated review instead of repeated trial and error: the tokens it saves go back into the design. What the doc says is cross-checked against the source; behaviour and flow are modelled and checked. |

## 文案为什么这么排

1. **第一句放收益**（省下的 token 留给设计）：商店列表里前十几个字决定眼睛停不停。收益之后紧跟做法，读者不会只看到口号。
2. **第二句给做法**：文档与源码交叉验证，行为与流程建模后交给引擎跑。这两件事才是这个插件与「再问一遍模型」的区别所在。
3. **第二句里不重复「自动化审查」**：它已经在第一句出现过，40 字内再来一次就是赘语。
4. **第二句取对偶**：「文档与源码交叉验证」对「行为与流程建模核查」，两个六字短语，节奏齐。代价是丢掉了「交给引擎跑」这一层明说——由第一句的「自动化审查」承担这层意思；README 开头的 bullet 仍用「交给引擎跑」，橱窗讲节奏、文档讲机制。
5. **用「核查」不用「核验」**：核查更口语，和第一句的「审查」同一语感层次；核验更正式，偏"机器给出结论"。两者的缺点一样——各与第一句共用一个字（核查／审查共用「查」，核验／验证共用「验」），所以按语感定，想换回来只改这一个词。英文跟着走 `checked`；要用更强的技术语感，可换成 `verified`。
6. **「建模后审查」的语序要避**：字面是「先建模，之后才审查」，把因果讲反了；实际是建成模型，由引擎去审。
7. **不写「替代模型推理」**：枚举断言、把设计抽成模型、把发现落回源码，仍然是推理；被替代的是反复试错。写过头，用户第一次用就会发现名不副实。
8. **不写「断言」「核验」「证据」「原语」**：这些是内部术语，橱窗里换成「文档里说的」「对着源码核」「落到哪一行」。
9. **不写 `file:line`**：橱窗里讲「落到具体哪一行」人人看得懂；要精确的人点进 README，那里有 `file:line`。

## 注册时注意

- **分类没有 `skill` 这一档**：现有 125 条集中在 `tools/dev`、`tools/model`、`ui/*`、`knowledge/*` 等。本插件属于 `tools/dev`，不能落在 `tools/model`——那里的 model 指大模型（本地模型、模型顺序、自动模型分层）。
- **`name` 要与插件卡片一致**：`package.json` 的 `dsh.displayName` 是同一个名字，两处别写成两个样。
- **`description` 与 `package.json` 的 `description` 不必相同**：后者给 npm 与代码读者，可以长；橱窗文案要短。
