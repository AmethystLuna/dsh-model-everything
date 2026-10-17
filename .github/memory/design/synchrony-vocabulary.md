---
name: synchrony-vocabulary
description: 并发扫描器为什么必须覆盖同步与异步、词表按 family 分组的理由、异步三种模型看不见的缺陷，以及一个被否掉的做法
metadata:
  type: decision
---

# 并发 / 同步 / 异步：词表与边界

`model_interleaving_scan` 原来只认线程与中断的词汇（thread-safe、mutex、ISR、临界区…）。一份纯异步的设计——`async`、`await`、promise、事件循环、回调——扫出来是**零条发现**，于是走 `CONCURRENCY_NO_CLAIM` 拒绝。这不是假绿（它如实说"没有我可挖的断言"），但它**看不见一整类设计**，而拒绝的理由把责任推给了写文档的人。

这已经是同一个缺陷的第二次出现。第一次是中文词表：中文文档扫不出东西，落进 no-claim，读起来像"扫过了、干净"。结论相同：**扫描器的词表就是它的射程，射程之外的东西不该由"没有发现"来代表。**

## 决定

1. **把射程从"并发"扩到"工作怎么被执行"**：线程、同步原语、异步、中断、共享状态。工具名不变（`model_interleaving_scan`）——改名的破坏性大于收益，而 `description` 与技能文本承担"它到底管什么"。
2. **每条规则带 `family`**（`threads` / `synchronization` / `async` / `interrupts` / `shared-state`），发现里也带。理由不是分类好看，而是**路由按家族分叉**：线程 → TSan/Helgrind/CBMC/TLA+；中断 → RTOS 感知分析；异步 → TLA+/UPPAAL + 运行时检查。没有 family，`suggestionsFor` 只能靠标签正则猜。
3. **绝对式异步断言按 error 报**：`non-blocking`、`never blocks`、`no blocking`（中文：非阻塞/不阻塞/无阻塞/零阻塞）。事件循环是共享资源，"它不阻塞"和"它是线程安全的"是同一类无条件断言。
4. **报告 `nextSteps` 点名异步的三个盲区**，因为它们在模型层面根本不可判：
   - 异步处理器里的阻塞调用（模型没有时钟，分不出同步读和 await 过的读）；
   - 漏掉的 `await`（不存在的转移，照计划的模型会忠实漏掉）；
   - 跨 `await` 持有的锁（扫描器能同页看到 `mutex` 和 `await`，看不出重叠）。
5. **技能与工具描述同步扩写**：技能 catalog 行（路由面）必须出现 async 词，否则技能本身不会被加载——这是"文档即指引"的自洽要求，不是文案偏好。

## 被否掉的做法

**新开一个 `model_async_scan` 工具。** 否掉的理由：它们的失败模式共享同一个问题（"这段并发/异步设计凭什么说它对"），拆成两个工具会让路由面多一个近义项，模型在两者之间选择时没有新信息可用。一个工具、一个 family 字段，判据放在发现里，更符合"一个工具做一件事"——那件事是**挖断言并按家族路由**，而不是分别挖两种断言。

## 仍然不覆盖

- 运行时的**阻塞证据**（事件循环延迟、被阻塞的 reactor 线程）：需要运行时探针，插件不采集。
- **调用路径上的 await 缺失**：静态审查或语言级 lint 的领域。
- 无界/公平性这类**真正的无界模型**：`model_verify` 是有限状态机；要审这类性质走 `model_export` → TLA+。

## 改名：`model_concurrency_scan` → `model_interleaving_scan`（2026-10-18）

射程扩到五类之后，"concurrency" 只覆盖了其中一类。新名字说**它找什么**：五类断言共享的那件事是**交错**——线程并发、`await` 让出、中断抢占、共享位置的读写顺序。

**报告族仍叫 concurrency**，而且这是刻意的：

- `CONCURRENCY_KEYWORD` / `CONCURRENCY_ABSOLUTE_CLAIM` / `CONCURRENCY_NO_CLAIM` 与 `model-everything/concurrency/v1` 是**契约**，改它们要重冻快照、改 report-reading 指南，而收益只是让名字对齐；
- 工具名与族名本来就不必相同：`model_verify` 返回 `S*` 码，`model_design_review` 返回 `DES*` 码，`uml_structure_verify` 返回 `UML*` 码。工具名说**动作**，族名说**报告属于哪一族**。

技能名同步改为 `model-everything-interleaving`（目录、frontmatter、闸门文本、README、路由表、用例语料一起改）。第一版只改了工具名并保留技能名，理由是"改名只会让引用它的地方跟着动"——实测下来这个理由站不住：工具说 interleaving、技能说 concurrency，读者要在两套词汇之间翻译一次，而技能名正是模型在 catalog 里看到的第一行。既已决定用"交错"命名这一类，就两边一致。

**族名仍然是 concurrency**，这条没变：契约（`CONCURRENCY_*`、`model-everything/concurrency/v1`）不因命名口味而改，而工具名/技能名说"找什么"，族名说"报告属于哪一族"。

改名在**发布前**做，所以没有外部调用者会受影响；发布之后再改就是破坏性变更。
