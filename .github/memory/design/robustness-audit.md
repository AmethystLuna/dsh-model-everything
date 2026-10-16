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

1. ~~**D1–D3 一起修**~~ **已完成（2026-10-16）**：三个引擎都补上了引用解析，纪律统一为——**声明里的名称解析不到就要报出来，绝不 `continue` 成空的全部通过**。落实到具体形态：
   - **D1 状态机**：`resourcePairs`/`concurrentPairs`/`idempotentEvents`/`tickEvents` 的悬空名称由 `withUnresolved` 报 `MODEL_UNRESOLVED_EVENT`（**warning**），并且**当检查已用自己的码说明时就沉默**（`A4_NO_RELEASE_EVENT` 的证据里带事件，避免一条缺陷两条发现）。定为 warning 是**测量结果**：教材书信号量用例故意写 `failEvent: 'timeout'` 并期望无 error。检查状态随之从 `pass` 变 `fail`（`detail` 仍是旧的全部通过措辞，属措辞瑕疵而非假判定）。
   - **D2 数据族**：schema 在 model/entity/field/invariant/boundary-check 五层封闭；七种从不解析的不变式（field-required、no-orphan、unique、referential-integrity、range、count-equal、field-equal）由新检查 **DS5** 解析。已解析的种类保留自己的码（`DA9`/`DA10`/`DA11`/`DS3`/`DS4`/`DD2`）。
   - **D3 设计族**：新检查 **DES12** 解析类型关系——`extends`/`implements`/`dependsOn`/`uses`、继承环、层成员、规则 source、必需边端点。`dependsOn`/`uses` 接受已声明类型**或**架构节点（两个标识空间）。
   - 顺带修好三处**夹具自身的缺陷**：数据夹具与工具边界夹具各带一个从未被读取的字段级 `primaryKey`；「守规矩的设计」夹具的 `OrderService.dependsOn` 指向两个图里不存在的节点。
   - **修 D2 时踩的坑**：第一版把 `DS3`/`DS4`/`DA9` 已经做的解析又做了一遍（大量用例变红才发现），并且误以为**选项**（`copyPairs`/`migrationMappings`/`backupPairs`）能靠**模型层**封闭兜住——它们不是模型字段，`tests/tool-boundary` 里那三条 pinned 用例因此仍成立。
2. ~~**D5**~~ **已完成（2026-10-16）**，并且**按数学而不是按更大的数字**解决：`maxStates` 归一（非有限/非整数/小于 1 → 换默认值并在 `summary.boundNotes` 说明；超上限 → 夹取并说明）。更重要的是一层**模型判据**：可达集是否无限是**模型的性质，不是预算的性质**——某变量在一个**初始态可达的环**上只朝一个方向走、且该方向**未声明界**，则每转一圈都产生新的运行态，于是**任何预算都不能决定这个模型**。这条在**走查之前**由转移图直接判定，报 `S6_UNBOUNDED_VARIABLE`，并加入 `UNDECIDED_CODES`（其语义正是「搜索没结论」，必须让 `truncated` 为真）。原来会把进程 OOM 掉的用例现在 **40 ms** 返回。
   - 判据**刻意收窄**：只认 `inc`/`dec` 的单调性，`set` 既不证明也不破坏，且只看初始态可达的环。第一版把**不可达孤岛**上的单调环也报了——那是分析**发明的**缺陷，不是找到的。数学判据的假阳性比假阴性更伤，因为它指控一个正确的模型。
3. ~~**D4**~~ **已完成（2026-10-16）**：guard 是**四种形状的代数树**，`validateGuard` 一直报得对，但校验器**收集错误却不中止**、又把调用者的原始 JSON 返回，于是第二次走查读到不存在的树、抛 `guard.all is not iterable` / `Cannot use 'in' operator`。修法：走查与求值做成**对任意 JSON 都全函数**（不认识的节点 = 恒假的 guard，safe 方向，因为校验器已拒绝该模型）。15 种畸形形状现在是带码的 `MODEL_INVALID` 报告。
   - 同时拒绝两种**合法 JSON 但非法逻辑**的形状：**空合取恒真**（`{all: []}` 会把带条件的转移**静默变成无条件转移**，却仍读作有条件），**空析取恒假**（死分支写成活的样子）。两者各带自己的理由文案。
   - 诚实说明：求值器的全函数化目前是**冗余防线**（校验器先拒，求值器到不了），变异检查确认了这一点——用例不假装覆盖它。
4. **D6–D10 未做**：各自补拒绝/警告；D6 的「未分层节点豁免」要么拒绝，要么报明确 warning。
5. **D11–D12 未做**：嵌套深度上限 + 参数形态守卫，抛文档化的错。
6. 每条修复**必须先有一条能红的用例**（已补：`runUnresolvedNameTests`、`runClosureTests`、DES12 的十四条例、`runBoundedSearchTests`、`runGuardShapeTests`）。**变异检查**：D4/D5 共 5 条真变异被抓住；1 条只改措辞、不改变任何答案的变异记为 missed，没有粉饰。
7. ~~**非机器族 UML 校验器审计**~~ **已完成（2026-10-16）**：七个族里**六个已经处理悬空引用**（use-case 与 timing 直接 `UML_INPUT` 拒绝；communication、interaction-overview、profile 由 review 报出）。**`composite-structure` 是唯一有这个缺陷的**，而修它的过程又挖出第二层：`reviewFamilyUml` 把**原始**模型交给族审查，而不是该族校验器产出的**规范形态**——于是 `UML059` 读不到 `undeclared`，悬空端点静默 `pass`。现已传入规范形态。第三层：复合族**没有 normalize**，导致「模型省略 `self.kind`」被报成 `self.kind invented by the diagram`（把自己补的默认值当成漂移）。三处都已修并各有回归用例。
   - 这轮的方法教训：我第一版探针**直接调 `reviewCompositeModel` 传原始模型**，得出「0 发现」的结论——那是**我的探针跳过了校验步骤**，不是引擎沉默。审计工具自己出错时最像「引擎有问题」。

## 一条贯穿全部修复的原则（2026-10-16 确立）

**能用数学挡住的异常，就不要靠撞上才发现；而「异常处理」本身也是建模的审查结果。**

落到代码上的三个层次：

1. **形状封闭**：畸形输入永远变成**带码的报告**，绝不抛裸错误。引擎从不抛错是它的既有约定，所以归一化时**夹取并记录**，而不是拒绝。（D4 的畸形 guard、D2 的封闭 schema、D1 的悬空名称。）
2. **代数退化**：合法 JSON 但非法逻辑的形状要**单独拒绝并说明理由**——空合取恒真会把「有条件」静默变成「无条件」。（D4。）
3. **模型可判定性**：与其走一万步再报「截断」，不如从模型本身算出**它是否可判定**，并把「不可判定」作为对模型的指控报出来。D5 是这条的第一个实现（`S6_UNBOUNDED_VARIABLE`）。

**这条原则还能往更远处走**，是后续的方向：`S6_UNBOUNDED_DOMAIN` 现在只是「guard 域太大枚举不完」，可以换成**区间/多面体分析**真正判定域是否有界；「转移成本是否可证有界」可以并入同一判据族；D11 的嵌套深度上限也属于第 1 层（结构性先验，而不是撞上栈溢出）。
