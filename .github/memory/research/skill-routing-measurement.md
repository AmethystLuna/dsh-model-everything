---
name: skill-routing-measurement
description: 技能路由的实测结果、方法与它测不到的东西——技能描述与工具描述的文字分配是否真的引导了选择
metadata:
  type: research
---

# 技能路由：怎么测的，测出了什么，测不到什么

**要回答的问题**：不通过 hook 注入，只靠**技能描述与工具描述里的文字**，模型能不能选中正确的技能？

## 结论（2026-10-17 实测）

对 `tests/skill-routing/corpus.json` 的全部 **93 条**用例，独立作答 **93/93 全对**，七个族无一失分（同一天的第二次实测是 92/93，一条翻转，见下——**先读那一节再引用这个数字**）：

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

## 第二次实测（2026-10-17 晚，同一份语料、同一份目录）：92/93，一条翻转

同一天又测了一次，方法与上面完全一致（独立子代理、只读提问文件、只回 JSON、`--decisions` 评分）。结果是 **92/93**，唯一条错：

```text
[near miss] "draw the class hierarchy as a diagram"    expected model-everything-uml, got model-everything-structure
```

它属于 `model-everything-design` 的近似误路由，所以七个族里只有 design 掉到 9/10，其余与第一次逐字相同。**这不是路由退化，是同一条用例翻面**：第一次答 uml，第二次答 structure。

**为什么它会翻**：`model-everything-uml` 的目录行原本写着「A component, class, object, package or deployment diagram **goes to** the model-everything-structure skill」——一句无条件的移交，而该技能正文的 render 一节把 class / object / package / component / deployment 都列在 PlantUML 能画的族里；`model-everything-structure` 那边只有读（`uml_structure_verify`），没有渲染。于是「画一张类图」这句话，目录说「不归我」，正文说「归我」，模型每次只能押一个。

**这属于「报告说得比它知道的多」的同一族**：目录行把「**分析**这类图去那边」说成了「这类图去那边」，多出来的那半个意思正好盖住了画图这一半。修法是让行只声明它确实拥有的部分：

- `goes to` → `is read as a dependency graph by`（移交的是读取与依赖检查，不是整个族）；
- `render a model` → `render a model in a notation that can draw it`（画图一侧明说自己能画）；
- 行从 428 字符涨到 466（预算 500，第一句 215 ≤ 220 的门槛）。

**留一条方法论教训**：翻转本身就是证据。同一份文本两次作答不同，说明这句文本没有唯一读法——**一条用例从"对"变"错"时，先怀疑文本有二义，再怀疑模型退步**。如果只跑一次，93/93 会让我们把一句自相矛盾的话记成"已经验过"。

## live 会话怎么测，以及它为什么贵

上面两种测法都只把**目录行**交给模型。真实用户遇到的是「目录行 + 系统提示 + 模型」一起作用，所以还有第二种测法：给一个**全新会话**只发那句请求，看它加载哪个技能。成本是一个会话一条，因此由 `--live-sample` 挑值得花会话的那些：每个域技能一条（语料顺序第一条），加上「这句话的词更像指向别的技能」的那些。

**样本随目录文本变化**：改动 `model-everything-uml` 那一行之后，同一条规则选出的样本从 12 条变成 13 条（第 55 条"the diagram in the RFC no longer matches the state machine in the code"进入了「词指向别人」的集合）。所以**样本必须和成绩一起记录**，否则两次 live 成绩不可比。

第一次试点（`"review this migration: the orders table gains a required column"`）的结论：

- **路由是对的**——子代理实际调用了 `model_datamodel_verify`，正是期望的 `model-everything-datamodel`；
- 但它在文件系统里找了二十分钟「不存在的那份迁移」，才回到方法本身。**裸请求会让会话先去找物料**，所以 live 提问必须写成有界的：说明物料不在、不要去找，只需给出你会先做什么；
- 观察通道只能是**自报**：要求会话结尾单起一行 `SKILLS LOADED: <技能名或 none>`。这是这套方法最弱的一环（它可能凭记忆写，而不是凭实际调用），读的时候要按这个折扣读。

## live 实测：13/13（2026-10-17 晚，改完 UML 行之后）

13 条全部命中：期望的技能都出现在会话自报的加载列表里（`--live-sample` 第 0、3、4、5、6、7、16、27、28、48、55、76、86 条）。

**评分规则是「期望技能在其中」，不是「只有它」**：域技能那几条几乎都同时加载了 `model-everything`——每条域描述都以「Doctrine: the model-everything skill」收尾，模型照着那句去加载教义技能。这是设计使然，但**代价是一次任务加载两份正文**（核心技能正文是全仓库最长的一份）。若哪天上下文成本成为问题，第一个该动的是这句收尾，而不是评分规则。

### 这 13 条到底测了什么：提示与干净对照

原提问里有两处**提示**，是我写的，必须记下来：`Answer with what you would do first … naming the tool or method you would reach for`，以及结尾那行 `SKILLS LOADED:`（后者把「skill」这个词提前放进了提问）。

去掉这两处提示，只留请求原文与「物料不在、别去找」，并且**先答完再补问加载了什么**（追问发生在行为之后，不影响行为）：

| 请求 | 期望 | 干净提示下 | 说明 |
|---|---|---|---|
| `"review this migration: the orders table gains a required column"` | datamodel | **`model-everything-datamodel`** | 唯一的、没有物料也能真正开工的一条：它给了实质评审，并选对了技能 |
| `"draw this retry flow as a state diagram"` | uml | `none` | **拒绝**：没有重试流程可画，画出来就是编造 |
| `"draw the class hierarchy as a diagram"` | uml | `none` | **拒绝**：同上，没有源码就没有类图 |

**读法**：

- 提示改变的是**行为**，不只是标签——它把「拒绝」变成了「说明我会怎么做」。所以 13/13 的正确读法是「**如果要做，它挑不挑得对**」，不是「真实用户的裸请求会让会话加载技能」。
- 但它**没有制造错误路由**：唯一能开工的那条，在完全没有提示时也选对了。路由本身是干净的。
- 由此得到下一轮 live 测法的硬约束：**观测必须发生在工作真的发生的时刻**。没有物料时，会话会正确地拒绝，而拒绝不需要方法——测到的是拒绝，不是路由。

**live 测不到的东西，比它测到的更重要**：

- 它测的是「这句话会让会话去加载哪个技能」；**它不测加载之后做得对不对**。13/13 只说明门开在对的地方。
- 自报是弱证据：第 48 条（`"our README claims the CLI is backwards compatible with v1 flags"`）的回答是完整的方法论，但**只有补问一次才拿到 `SKILLS LOADED` 行**。少一次补问，它就变成"未报告"，而不是"对"。
- 样本由规则推出，因此**不含**我们最关心的那条修复用例（`"draw the class hierarchy as a diagram"` 不在 13 条里），所以文本修复另做了一次单点回归（见下）。

## 注入开关的 A/B：四条配对用例（2026-10-17 夜）

同一个 prompt 跑两次，唯一差别是门禁的 `enabled`。开关不是手点的：装了一个**只做 row-id 覆盖**的小 bundle（`id: dsh-model-everything-gate` + `config.enabled: true`）把它打开，测完卸载回到默认。注入**真的发生了**——那条 `<EXTREMELY_IMPORTANT>` 出现在我自己的会话里，`status` 从 false 变 true 再变回 false。

| 用例 | 期望技能 | 开：技能 / 工具 | 关：技能 / 工具 |
|---|---|---|---|
| 状态机：RFC 正文说 DONE 是终态，图上却有 `DONE --> DONE : retry` | model-everything | model-everything + uml / `uml_parse` + `model_verify` | **none** / `model_verify` |
| 部署图：只有 db 能直接碰 postgres | structure | structure / `uml_structure_verify` | structure / `uml_structure_verify` |
| 迁移：4M 行的表加一个 `NOT NULL` 列 | datamodel | **none** / none | **none** / none |
| 并发：lock-free 环形缓冲 + ISR 里的原子自增 | concurrency | concurrency / `model_concurrency_scan` | concurrency / `model_concurrency_scan` |

**工具 3/4 vs 3/4，技能 3/4 vs 2/4。**差的那一条是状态机。

要分两层读：

- **工具那一层没有被改变。**工具描述本来就在每一轮的上下文里，所以两种条件下模型都会去调 `model_verify`、`uml_structure_verify`、`model_concurrency_scan`。**门禁不是让插件变得可用的东西。**
- **技能那一层只差一条，而且两个答案都抓到了同一个矛盾。**开的那次先 `uml_parse` 读图、按图建模：结论是"照这么画，DONE 会一直 retry"；关的那次按正文把 DONE 当终态：结论是"终态不该有出边，图和正文矛盾"。两条都对，角度不同——这正是教义（照着物料建、不照着散文建）起作用的那一条，但它只值一条。

**所以：单次版本没有证明注入带来路由收益。** n=4/组、只跑一次；最能考验门禁的那条（迁移：既没加载技能也没用工具，而门禁文本明确列了 datamodel）**没有任何变化**。要判断它有没有用，需要更大的样本和更难的题——比如没有物料、只有一句话的请求（干净对照里那种会被正确拒绝的）。**下一节把这条约束加在首尾再跑了一次，结论变了。**

**读法**：这是**配对观察**，不是显著性检验。别把 3/4 与 2/4 说成"提升 25 个百分点"。

## 第三臂：把关键约束放在首尾重复（2026-10-17 深夜）

同一组四题，加一条**对照**（把一句话改短——这题**不该**加载任何技能，用来量"过载"）。第三臂的文本是同一份 2528 字符，**首尾各加一句规则**（措辞不同），共 2931 字符（+403，+16%）：

- 开头：*Before answering anything about code, a design or a diagram: load the skill whose routing applies, and let its tool decide. Do not answer from memory first.*
- 结尾：同一件事换个说法，并加上 *a claim you can check is not a claim you may answer from memory*。

| 用例 | 关 | 单次（2528） | 首尾重复（2931） |
|---|---|---|---|
| 状态机 | none / `model_verify` | uml+me / `uml_parse`+`model_verify` | uml+me / `uml_parse`+`model_verify` |
| 部署图 | structure / verify | structure / verify | structure / verify |
| **迁移** | **none / none** | **none / none** | **datamodel / `model_datamodel_verify`**（`DS2`+`DS4`） |
| 并发 | concurrency / scan | concurrency / scan | concurrency / scan |
| 对照（改写句子） | none | none | **none** |
| **期望技能** | 2/4 | 3/4 | **4/4** |
| **误加载** | 0/1 | 0/1 | **0/1** |

**重复把唯一漏掉的那条补上了，而且答案变了质**：迁移那条从"一段没跑过任何工具的散文"变成"建了 BEFORE/AFTER 模型、跑出 `DS2_REQUIRED_FIELD_UNSOURCED` 与 `DS4_REQUIRED_NULL_DEFAULT` 两条真发现"。对照三条都是 `none`，**没有观察到过载**。

**我的三个预测，对了半个**：3/4→4/4 对了；"迁移那条用了工具但结论不变"错了（结论拿到了工具给出的码）；"至少多出一次误加载"也错了（对照干净）。

**局限**（比结果更重要）：n=5/组、只跑一次；三臂是顺序跑的，没有随机化；对照只有"改写句子"一种任务，别的任务上仍可能过载；第三臂改的是**内容**（多了两句规则），不是纯粹增加次数——所以它测的是"首尾各加一句明确约束"，不是"同一段重复三遍"。

## 单点回归：那条翻转的用例，改完文本之后

对着修过的那一行，再发一次同一条请求（`"draw the class hierarchy as a diagram"`，期望 `model-everything-uml`）：

- **改之前**：打印目录那次实测答 `model-everything-structure`（错，就是翻转的那条）；
- **改之后**：live 会话说 `SKILLS LOADED: model-everything-uml`，并给出了「先用 ctags / 语法树把类与 extends/implements 抽出来，再画再审」的方法——正是这条用例期望的那条路。

**这一条只能算方向证据，不是分数**：两次用的不是同一种测法（打印目录 vs live），样本各只有一次。要和 93 条那两次比，得重跑打印目录那一半。

## 这个数字**测不到**什么

- **它测的是「目录文本足以判定这 93 条」，不是「任意输入都能路由对」。** 语料是人写的，100% 的含义是「描述区分开了语料里构造的边界」，不是「描述无法被误读」。
- **它不测独立于作者的程度**：作者与作答者同源，所以「读法是否唯一」没有被独立验证。要真测，需要换一个模型族作答。
- **历史语料上的 100% 不能直接引用**：语料随技能增加而变长变序。存档答案按下标编号，语料一动下标就错位——`decisions-perfect.json` 对它自己的提交是 45/45，对今天的语料是 33/93，**这不是路由退化，是对齐失效**。跨时间比较必须**按用例文本**重映射（下标不可用）。

## 守住它的东西

| 机制 | 守什么 |
|---|---|
| `tests/skill-routing/run.mjs`（结构性一半，进 `test:engine`） | 每条用例点名一个**已发布**技能；每个技能至少是一处触发、一处近似误路由；**期望某个域技能的用例必须点到该技能目录行里确实有的词**（按整词 + 五字母词干；请求的动词不算，入口技能按消解式路由豁免）。这条判据原先只要一个子串命中，`"review"` 落在 `"Use when reviewing…"` 里就算数，删掉决定性词照样绿 |
| `tests/routing-map/run.mjs` | 路由图必须等于**当前**目录生成的图（加技能后忘重新生成会红） |
| `tests/catalog/run.mjs` | 每行开头是触发句、点名兄弟、有范围声明；不许有脆弱计数 |

## 一次真实的漂移（值得记住）

路由图当初**提交进 `docs/` 却没有漂移测试**。后来加了报告解读技能，图仍停在六个技能——**生成物没有测试就是一份会悄悄变假的快照**。现已补 `tests/routing-map/`，并复现了那次漂移（测试红了，重新生成后才绿）。

同类的第二次：报告解读技能的描述里我写了「one element makes **two** checks inseparable」，被 `tests/skills` 的脆弱计数检查抓住，改成不带数字的说法。

## 相关

- 图与文字分配：[routing-map](../../../docs/routing-map.md)（由 `docs/tools/generate-routing-map.mjs` 从目录 + 语料 + 工具定义生成）
- 报告解读的方法与图：[report-reading](../../../docs/report-reading/guide.md)
