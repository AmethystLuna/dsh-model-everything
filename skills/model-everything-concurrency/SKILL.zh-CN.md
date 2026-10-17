# Model Everything —— 并发类断言

这项技能**不**证明并发安全，它产出的任何报告都不该被读成证明。它在文档、计划或代码评审里挖出关于**工作怎样被执行**的断言——线程、同步原语、异步任务、中断、共享状态——把每一条标成 `UNVERIFIED`，再转给真正能判定它的工具。

它继承的断言核验教义——枚举可核验的断言、给出 `file:line`、读 `verdict` 而不读 `ok`——在 `model-everything` 技能里。当任务是状态机的行为核验、而不是对并发断言下判断时，加载那一份。

English: [SKILL.md](SKILL.md)

## 什么时候适用

**先确认目标真的有并发需求或并发行为**——多线程、异步任务、中断、共享状态、并行执行。目标如果是纯顺序的，就不要启用并发挖掘：那里没有东西可挖。

异步也算并发，而且是最常被漏掉的那一种：单线程事件循环照样在交错执行，下面每一条失败模式都适用于它。

| 断言 | 怎么处理 |
|---|---|
| 绝对式：「thread-safe」「lock-free」「no data race」「interrupt-safe」「ISR-safe」 | error / `UNVERIFIED`，除非给出专门的证据 |
| 绝对式（异步）：「non-blocking」「never blocks」「no blocking」 | error / `UNVERIFIED` —— 事件循环是共享资源，而这句断言是无条件的 |
| 风险关键词：「race condition」「shared variable」「mutex」「atomic」「shared memory」「critical section」、`ISR`、`IRQ`、`NMI`、`disable_irq` / `enable_irq` | warning —— 检查计划是否真的处理了它 |
| 异步关键词：「async」「await」「promise」「event loop」「callback」「microtask」「coroutine」「fire-and-forget」「backpressure」 | warning —— 要审的是交错，不是词汇 |
| lock/unlock、alloc/free、start/stop 这类顺序敏感的配对 | 转给 `model_verify`（A4 配对对称性），它能在被建模的机器上判定是否平衡 |

在 DSH 里跑 `model_interleaving_scan` 工具。人工审查请照 [`references/concurrency-risk-guide.md`](references/concurrency-risk-guide.md)。

## 路由：每条断言由什么来判定

挖出一条断言不等于核验了它。把每一条交给能判定的工具：

| 维度 | 判定它的工具 |
|---|---|
| 数据竞争、加锁顺序、无锁算法 | ThreadSanitizer、Helgrind，或在真实代码上的模型检查器（CBMC） |
| 中断/ISR 竞争、临界区 | 具备 RTOS 感知的中断分析，或 ISR 与任务交错顺序的 TLA+ 模型 |
| 离散事件之间的协议级交错 | `model_verify`（S1-S8 / A1-A14）与 `model_compose_verify`（C1/C2） |
| 异步任务交错、丢失唤醒、永不发生的握手 | TLA+（由 `model_export` 导出），或两任务情形用 `model_compose_verify` |
| 两个任务都更新的同一个共享位置（丢更新、无序写） | 用 `shared` + `accesses` 调 `model_compose_verify`：C5 报出模型没有做成原子的读-改-写对，C4 报无序写，C3 报指向不存在对象的声明。两侧点名同一把锁的会被排除，报告会数出来 |
| 超时、截止期、可能永远不来的回调 | 带 `maxTicks` + `tickEvents` 的 `model_verify`，或 `model_export` → UPPAAL（时钟） |
| 异步处理器里的阻塞调用、漏掉的 `await`、没人接的 promise | **这里判不了。** 需要运行时或静态检查（事件循环阻塞检测、调用路径的 lint/评审）——说出那个检查名字，绝不要说设计是干净的 |
| 硬实时：截止期、周期、抢占 | 调度分析（RMA/EDF）与计时工具 —— 不是本工具箱 |
| 概率或可靠性断言 | PRISM/Storm、故障树分析 |

完整路由表（含硬实时、混合控制与执行成本三个维度）在 [`../model-everything/references/gap-routing-guide.md`](../model-everything/references/gap-routing-guide.md)。`model_verify` 的报告会在匹配的模型上，以 informational 的 `coverageNotes` 带上同样的路由。

## 异步审查看不到什么

异步的缺陷藏在模型表达不了的地方，所以报告必须说出来，而不是暗示自己覆盖了：

1. **异步处理器里的阻塞调用。** 模型没有时钟也没有运行时，它分不出同步读取和 `await` 过的读取。「这个处理器是非阻塞的」需要运行时检查（事件循环延迟、阻塞检测器），不是一次扫描。
2. **漏掉的 `await`。** 那是一个不存在的转移，照着计划建出来的模型会忠实地漏掉它。静态审查调用路径才能抓到；扫描只告诉你该去哪里看。
3. **跨 `await` 持有的锁。** 扫描器能在同一页上看到 `mutex` 和 `await`，看不出它们重叠。如果这个位置真要较真，就在 `shared` 里声明它、在 `accesses` 里声明两侧：模型没做成原子时 `model_compose_verify` 会报 C5，并数出被命名锁排除掉的对数。锁是否真的在整个操作期间持有，仍是 `model_verify` 的单机问题。

这三处都是「没有发现」和「没有问题」不同的地方。说清楚你查了哪一个、用什么查的。

## 本模式的规则

1. **挖，不是证。** 并发断言报成 `UNVERIFIED` 并给出路由目标；永远不要报成通过。
2. **答案里不许出现绝对语气。**「这是线程安全的」正是被挖的那条断言，不是这项技能能产出的结果。
3. **一个反例就足以推翻。** 若怀疑存在竞争，交付物是能打破它的那个交错序列，以及把它演出来的 harness（TSan/Helgrind 的输出），而不是一段论证。
4. **纯顺序的目标不在范围内。** 如果没有东西并发运行，说出来并停下。单线程的异步服务不是纯顺序的：每一个 `await` 处都存在交错。
5. **扫描器是 `model_interleaving_scan`。** 如果本部署没有注册它，就照上面的关键词表人工挖文本，并按同样的方式路由每一条断言。
6. **用文字说出断言和它的路由。**「QoS 1 只投递一次」加上判定它的工具，绝不是一个光秃秃的检查项名字。没背下本技能表格的读者，从一串枚举里学不到任何东西。完整规则在 `model_verify` 技能的「Writing the Answer」一节。
