---
name: robustness-audit
description: 异常/非法输入专项审查的结论：以「拼错的名称把检查静默关掉、然后报出正面的全部通过」为主的一族缺陷、逐条清单与修复计划
metadata:
  type: design
---

# 稳健性审查（2026-10-16，只读子代理，约 549 次调用）

判据不是「遇到垃圾会不会崩」——抛错常常是**正确**答案。判据是：**要么带一份说清问题的报告拒绝，要么抛文档化的错；绝不静默 `pass`、绝不返回坏报告、绝不挂死。**

## 结论：报告形态是好的，问题在 `verdict`

**387 次调用里 0 份畸形报告**；文本解析器对 14 种恶意载荷全部 ≤4 ms，无注入得手；状态机的结构校验**确实是封闭的**（12/12 以 `MODEL_INVALID` 拒绝，状态/变量/事件/不变式的引用都解析）。坏消息在另一处：

**主缺陷族（严重）：拼错的名称把检查静默关掉，然后报出正面的「全部通过」。** 全部是普通 JSON，不需要任何奇异输入。

| 引擎 | 拼错 | 结果 |
|---|---|---|
| 状态机 | `resourcePairs`/`concurrentPairs`/`idempotentEvents`/`tickEvents` 里的事件名 | `acq/rel/finish` → **fail**；改成 `aqc/rle/fl` → **pass**，A4 报「All pairs balanced」、A6 报「No resource vulnerabilities detected」 |
| 数据 | `primaryKey`/`uniqueKeys`/`required`+`nullable`，以及 13 种不变式里 7 种的引用 | `primaryKey:['ghost']` → fail；`primryKey:['ghost']` → **pass** |
| 设计 | `extends`/`implements`/`dependsOn`/`uses[].type`/层成员/`allowedEdges` | `extends:'Ghost'`、自继承、互继承、`extends` 四环 → 全部 **pass 无发现** |

讽刺的是：`dsh-model-schema.md:130` **明文要求** `resourcePairs` 的事件指名一个已声明的事件，并写明原因「**空洞的检查比拒绝更糟**……两者都会为一个从未被真正检查过的模型报 pass」。数据族的 schema 文档也声称 `count-equal`/`field-equal` 会做结构校验（引用实体/字段存在）——引擎没做。

## 其余逐条

| # | 缺陷 | 类 | 位置 |
|---|---|---|---|
| D4 | `guard={"all":5}` 抛**裸 `TypeError`**（`validateGuard` 已记录该错，第二次走查又读了同一畸形节点）；`{any:{}}`、`{not:null}`、`{all:'abc'}` 同 | b | `engine.ts:969-975`、`:991` |
| D5 | `maxStates: NaN` → **堆内存耗尽、进程中止**（约 70 s / 4 GB）；`Infinity` 120 s 未停；`maxPermutationEvents:100` → **41.5 s**（默认 5 → 12 ms）。`tool.ts` 的 `timeoutMs:10_000` **无法抢占同步循环或 OOM** | e | `engine.ts:3197-3200` |
| D6 | 未被任何层认领的节点**豁免** `UML024`：同一张图 `layers top=[A],bot=[B]` → fail；只给 `top=[A]` → **pass**。层成员不在图里、规则 `source` 匹配不到边，同样隐形 | c | `structure.ts:630`、`:596` |
| D7 | `variables[].init/min/max`、`boundaryChecks[].values`、`updates[].value` 只做 `typeof`（`cost`/`weight`/`budget`/`p` 用了 `Number.isFinite`）：`init: NaN` + `max:10` → **pass**，S7 报「All invariants hold」 | c | `engine.ts:675-677`、`:823`、`:641` |
| D8 | `notation` 被**强转**而非拒绝：`'Mermiad'`/`'nope'`/`42` 被当 PlantUML 解析，在**另一张图**上通过；而 `uml.renderUml`/`parseUml` 对同样滥用抛文档化的 `UmlError(UML_INPUT)` | c | `structure.ts:194-197` |
| D9 | `exportModel(model, 'nope'\|'TLA'\|7\|null)` **静默变成 SPIN**（无最终 `else`） | c | `exporters.ts:340-346` |
| D10 | `diffReports(null,null)`、`(5,5)`、`('junk','junk')` → **pass**「no new findings, nothing resolved」。`currentVerdict` 默认 `'fail'` 有缓解，但**无法区分**它与真正干净的 delta | c | `baseline.ts:71-87`、`:96-110` |
| D11 | 10000 层嵌套 → `RangeError` 栈溢出，且在 `validateModel` **之前**（`metadataKeysOf` 的走查） | e | `engine.ts:524-540` |
| D12 | 参数形态不检查：`reviewStructure(null)`、`runConcurrencyScan(null)`、`runVerification(model, null)` 等抛裸 `TypeError`（抛而非 pass，所以无假判定） | c | 多处 |

## 待定的模糊点（审查者未能判定，需我们决定）

- `runConcurrencyScan` 空文本 → `pass` 且 `summary.keywords: 0`：「没找到声明」是否该像 UML 族那样把 skip 变成 warning（`UML019`）？
- 空架构的设计审阅 → `pass`，11 项检查里 9 项 `skip`，只在 `nextSteps` 里可见。
- `reviewStructure({matrix:{}})` → `pass` 但报告里带着 `hashes.matrix` 且 `rules: 0`——**报告与自己的哈希矛盾**。
- 粒度分析重名图 → `pass`：`parentCycle` 用 `Map` 合并重名，后一个 `parent` 静默解析到最后一个。**没有文档说名字必须唯一。**
- 括号不配平的结构文本 → 尽力解析 + `pass`，对多余括号没有警告（`structure.ts:190-193` 明说「此处不拒绝」）——但畸形正文会改变解析器看到的东西。

## 覆盖缺口（审查者明说没做的）

- **工具/框架边界未实测**：`guard:{all:5}` 是否被 `model:{type:'json'}` 接受、抛出的 `TypeError` 如何呈现为工具错误，都是从 `tool.ts:61` 推断的。
- **非机器族的 UML 校验器/审阅器**（use-case、class、timing、profile、composite、communication、interaction-overview）只经 `parseUml`/`renderUml` 探过；它们的 `validate*Model`/`review*Model` 引用解析**未审**——**预计 D1–D3 那一族在那里还有更多**。
- 未跑仓库自带套件（重建 `lib/` 会写盘，任务书禁止），所以无法判断这些行为是否已被覆盖。

## 修复计划（按严重度）

1. **D1–D3 一起修**：三个引擎都补**引用解析**，并统一一条纪律——**声明里的名称解析不到就拒绝（或报 error），绝不 `continue`**。这条正是「空洞的检查比拒绝更糟」的落地。
2. **D5**：选项先归一（`Number.isFinite` + 上界），再进搜索；`maxStates: NaN/Infinity` 拒绝，`maxPermutationEvents` 设上界。
3. **D4**：`validateGuard` 失败后**不要**再让第二次走查读同一畸形节点（提前返回或跳过）。
4. **D6–D10**：各自补拒绝/警告；其中 D6 的「未分层节点豁免」要么拒绝，要么报明确 warning，不能让 `summary.layerViolations: 0` 读成「分层成立」。
5. **D11–D12**：深度上限（走查前先限制嵌套深度）+ 参数形态守卫，抛文档化的错。
6. 每条修复**必须先有一条能红的用例**（否则修了还会再犯），并在 `tests/negatives` 补最邻近反例。
7. 顺带把**非机器族 UML 校验器**的引用解析补齐审计（审查者的预测点）。
