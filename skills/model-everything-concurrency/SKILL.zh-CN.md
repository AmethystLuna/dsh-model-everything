# Model Everything —— 并发类断言

这项技能**不**证明并发安全，它产出的任何报告都不该被读成证明。它在文档、计划或代码评审里挖出并发断言，标成 `UNVERIFIED`，再把每一条转给真正能判定它的工具。

它继承的断言核验教义——枚举可核验的断言、给出 `file:line`、读 `verdict` 而不读 `ok`——在 `model-everything` 技能里。当任务是状态机的行为核验、而不是对并发断言下判断时，加载那一份。

English: [SKILL.md](SKILL.md)

## 什么时候适用

**先确认目标真的有并发需求或并发行为**——多线程、异步任务、中断、共享状态、并行执行。目标如果是纯顺序的，就不要启用并发挖掘：那里没有东西可挖。

| 断言 | 怎么处理 |
|---|---|
| 绝对式：「thread-safe」「lock-free」「no data race」「interrupt-safe」「ISR-safe」 | error / `UNVERIFIED`，除非给出专门的证据 |
| 风险关键词：「race condition」「shared variable」「mutex」「atomic」「shared memory」「critical section」、`ISR`、`IRQ`、`NMI`、`disable_irq` / `enable_irq` | warning —— 检查计划是否真的处理了它 |
| lock/unlock、alloc/free、start/stop 这类顺序敏感的配对 | 转给 `model_verify`（A4 配对对称性），它能在被建模的机器上判定是否平衡 |

在 DSH 里跑 `model_concurrency_scan` 工具。人工审查请照 [`references/concurrency-risk-guide.md`](references/concurrency-risk-guide.md)。

## 路由：每条断言由什么来判定

挖出一条断言不等于核验了它。把每一条交给能判定的工具：

| 维度 | 判定它的工具 |
|---|---|
| 数据竞争、加锁顺序、无锁算法 | ThreadSanitizer、Helgrind，或在真实代码上的模型检查器（CBMC） |
| 中断/ISR 竞争、临界区 | 具备 RTOS 感知的中断分析，或 ISR 与任务交错顺序的 TLA+ 模型 |
| 离散事件之间的协议级交错 | `model_verify`（S1-S8 / A1-A14）与 `model_compose_verify`（C1/C2） |
| 硬实时：截止期、周期、抢占 | 调度分析（RMA/EDF）与计时工具 —— 不是本工具箱 |
| 概率或可靠性断言 | PRISM/Storm、故障树分析 |

完整路由表（含硬实时、混合控制与执行成本三个维度）在 [`../model-everything/references/gap-routing-guide.md`](../model-everything/references/gap-routing-guide.md)。`model_verify` 的报告会在匹配的模型上，以 informational 的 `coverageNotes` 带上同样的路由。

## 本模式的规则

1. **挖，不是证。** 并发断言报成 `UNVERIFIED` 并给出路由目标；永远不要报成通过。
2. **答案里不许出现绝对语气。**「这是线程安全的」正是被挖的那条断言，不是这项技能能产出的结果。
3. **一个反例就足以推翻。** 若怀疑存在竞争，交付物是能打破它的那个交错序列，以及把它演出来的 harness（TSan/Helgrind 的输出），而不是一段论证。
4. **纯顺序的目标不在范围内。** 如果没有东西并发运行，说出来并停下。
5. **扫描器是 `model_concurrency_scan`。** 如果本部署没有注册它，就照上面的关键词表人工挖文本，并按同样的方式路由每一条断言。
6. **用文字说出断言和它的路由。**「QoS 1 只投递一次」加上判定它的工具，绝不是一个光秃秃的检查项名字。没背下本技能表格的读者，从一串枚举里学不到任何东西。完整规则在 `model_verify` 技能的「Writing the Answer」一节。
