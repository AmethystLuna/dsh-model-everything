---
name: self-checks
description: 引擎、报告与文档的九层自证：家族可达、往返保真、能力矩阵、报告契约、视图一致、步骤可执行、字段路径、链接与命令，各自用哪个套件与变异点守住
metadata:
  type: project
---

# 自证：引擎、报告与文档各自被什么守住

这份索引回答一个问题：**当一条声明写在某处（引擎的表、技能的文字、报告的字段）时，哪一条用例会让它变成假话的那一刻报红。** 没有这一层的声明，
读起来与真话没有区别。

## 0. 基线（第 110 轮实测）

| 指标 | 数值 |
|---|---|
| `test:engine` 套件 | 74 |
| 缺陷注入点 | 71 |
| 技能 | 8 |
| 记忆主题 | 24（含本文件） |

## 1. 九层与各自的守门套件

| 层 | 声明在哪 | 守门套件 | 它能抓到什么 |
|---|---|---|---|
| 家族可达 | `UML_FAMILIES` 的 `parseable` / `declarations` | `tests/uml-families` | 表里写着可解析、实际检测不到（第 101 轮：`use-case` 关键字不在扫描名单里） |
| 往返保真 | 同上，`parseThroughApproximation` | `tests/uml-families` | 画出来再读回来模型变了（第 102 轮：`component "c" as c` 多出一个 label） |
| 能力矩阵 | 每格 `fidelity` | `tests/uml-capability` | 画不了的格子报了别族的理由、近似视图不报警告（第 103 轮：`profile`+mermaid 回复了谈 PlantUML 的句子） |
| 文档的家族说法 | `skills/model-everything-uml/SKILL.md` | `tests/uml-docs` | 技能列了过期的可画家族（第 104 轮：漏了 use-case 与 Mermaid class） |
| 报告契约 | 每个 `verdict` / `verdictReason` / `nextSteps` | `tests/report-contract` | 通过却带 error、失败不点名码、失败没有下一步 |
| 视图一致 | `renderReportText` 的正文与 `full` | `tests/report-views` | 正文比本体还贵、正文丢了结论 |
| 步骤可执行 | `nextSteps` 里点名的工具 | `tests/next-steps` | 让我去跑一个不存在的工具 |
| 字段路径 | 技能里写 `summary.errors` 之类 | `tests/doc-paths` | 让我去看一个不存在的字段 |
| 链接与命令 | 文档里的链接、`npm run`、`node` 路径 | `tests/docs-paths` | 重命名之后句子还指着旧文件名 |

## 1.5 已经有人守着的，不要再写一遍（第 116 轮核对）

打算给“技能登记表”加检查时先量了一遍，结论是**已经覆盖**，于是没有新增套件：

| 想加的检查 | 已经由谁守着 |
|---|---|
| 每个 `skills/<目录>` 有 `SKILL.md` | `tests/skills`：从磁盘枚举目录，`readFrontmatter` 缺文件即抛 |
| frontmatter 的 `name` 等于目录名 | 同上（有一条断言原话就是 “name does not match directory”） |
| `description` 格式与 500 字符可见预算 | 同上 |
| 同名技能 | 不可能：`name` 必须等于目录名，目录名唯一 |
| 中英成对文档同步 | `tests/translation` 的 `PAIRS` 表（其中一对就是 interleaving 的 `SKILL.zh-CN.md`） |

同一轮把**变异运行名单**与**门禁名单**两侧都补上了守卫：前者是 `tools/mutation.mjs` 开跑前的警告，后者是 `tests/suite-registry`。

**做法上的收获**：想加检查之前先量“是否已有”，比加一个重复的检查更有价值——重复的检查会在改规则时给出两个不一致的答案。

## 2. 两类能测与不能测

- **结构可测**：路径、链接、命令、家族 id、字段名、能力判定。它们有名字、有位置，能机械核对。第 109 轮的 `docs-paths` 就是这么来的。
- **断言不可测**：像「Mermaid 能画 X」这样的**散文断言**。第 104 轮我曾给它加过一个变异点（把句子改成谎话），结果**没有被任何套件抓到**——
  因为没有任何东西读散文的含义。那个变异点被撤掉，理由写在提交里：**留一个永远抓不到的红是给后来人放假警报。**

所以这一层做法是：把声明搬到**结构化数据**（表、枚举、schema），再让它可测；留在散文里的部分，只用 `uml-docs` 这类“点了名的家族 id 必须存在”的弱检查兜住。

## 3. 变异点的偏差（值得记住）

这一阶段的变异点有三次**打偏**，原因各不相同，都是“变异测试自己的陷阱”：

| 编号 | 打偏的原因 | 教训 |
|---|---|---|
| M64 | 改的是不可达分支 | 要破坏**做决定**的那一行 |
| M69 | `from` 指向的文件里没有这段文字（`BROKEN`） | `BROKEN` 与 `MISSED` 要分开读 |
| M70 | 相同文本出现两次，替换到了另一处 | 瞄准被复用的函数本身更可靠 |

## 4. 第二段：工具面、报告面、登记面（第 111–120 轮）

| 层 | 守门套件 | 它能抓到什么 |
|---|---|---|
| 工具 schema 的承诺 | `tests/tool-schema` | `kind` 枚举与引擎家族表不一致、必填参数被当成可选、注册名与 schema 名不符 |
| 描述里的默认值 | `tests/tool-defaults` | `kind`/`notation`/`reportView`/`maxSteps` 的默认值与描述不符（`maxSteps` 只能靠“画出来有多少步”验证） |
| `report_diff` 的身份规则 | `tests/diff-claims` | 改措辞被当成新问题（= 一次重构被读成回归） |
| 意图矩阵 | `tests/intent` | `intent` 被当成改报告的开关（它只是守门），或该拒的组合被放行 |
| 被上限截断的检查 | `tests/check-status` | 没东西可查却报 `pass` |
| 汇总计数 | `tests/summary-counters` | `summary.errors` 与 `checks[]` 不符；组合族没有 `checksRun` 这一套 |
| 套件登记表 | `tests/suite-registry` | 写了套件没上门禁 / 幽灵条目 / 重复登记 / 把助手当套件 |
| 文档里的路径与命令 | `tests/docs-paths` | 死链、改名的脚本、不存在的 `node` 路径、正文里点名的参考文件 |

### 第二段的基线（第 120 轮实测）

| 指标 | 数值 |
|---|---|
| 门禁命令 | 81 |
| 变异点 | 78 |
| 变异运行名单上的套件 | 44 |

### 这一段修掉的真实缺陷

- **`use-case` 关键字不在检测扫描里**：表里写着 parseable 的家族根本到不了（第 101 轮）；
- **复合结构的自我分类器写成 `"c" as c`**：往返多出一个 label（第 102 轮）；
- **解析先问家族后问记号**：Mermaid 的 `profile` 得到一句谈 PlantUML 的拒绝（第 103 轮）；
- **技能里的可画家族清单是表的副本**：漏了两个真实可画的组合（第 104 轮）；
- **被上限截断的 A3 报 `pass`**：一次置换都没做，读者却读成“顺序依赖已检查且不存在”（第 118 轮）。

### 变异点在这一段的四次打偏

| 编号 | 原因 | 教训 |
|---|---|---|
| M69 | `from` 指向的文件里没有这段文字 | 工具报 `BROKEN`，与 `MISSED` 分开读 |
| M70 | 相同文本两处，替换了另一处 | 瞄准**被复用的函数**更可靠 |
| M74 | 套件没进变异运行名单 | 未命中时**先查名单**（已加开跑前警告） |
| M77 | 用例写在 `tests/engine`，而它不在运行名单 | 断言要放在**会跑**的套件里；第 118 轮因此新建 `tests/check-status` |

## 3.5 第三段：四个“输入是否装饰”的面（第 121–126 轮）

| 面 | 守门套件 | 它钉住的东西 |
|---|---|---|
| 导出 | `tests/export-warnings` | 每种格式点名它翻译不了的性质；**PRISM 能表达概率，所以它不得为概率报警** |
| diff 的家族边界 | `tests/diff-families` | 不同 schema 的报告拒收；部分报告刻意接受 |
| diff 的建议 | `tests/diff-next-steps` | 四种 delta 各有说法，“干净但当前仍失败”必须说出来 |
| 组合的可选输入 | `tests/compose-inputs` | `rendezvous`→C2、`shared`+`accesses`→C4/C5、未声明的锁→C3 |
| 数据模型的回归输入 | `tests/datamodel-inputs` | 无 `beforeModel` 时 DD 不在名单（跳过原因写在 DA5）；映射只降级 error、不抹掉 `DD3` |

### 这一段的教训：**先读答案，再写断言**

这六轮里我有**五次**把“我以为的行为”写成断言，每次都是用例先红、代码没错：

| 我以为 | 实际 |
|---|---|
| `intent` 会改报告 | 它只拒收服务不了的配对 |
| 无 `beforeModel` 时 DD1–DD4 是 `skip` | 它们**不在名单**（`model_verify` 的 D1–D4 同） |
| 新增 warning 后 delta 仍是 `pass` | 变成 `pass_with_findings` |
| 空块消息含 “nothing inside it” | 是 “nothing **drawn** inside it” |
| diff 的 added 条目在 `after.severity` 里 | `severity` 就在条目上 |

规则已写进 `tests/AGENTS.md`：**先跑一次、读返回、再写断言**。若读数与文档冲突，而文档说这是刻意的（有注释、邻居家族同样），就**钉住行为并记录理由**；否则读数就是一条 finding，不是一条测试。

### 第三段基线（第 126 轮实测）

| 指标 | 数值 |
|---|---|
| 门禁命令 | 88 |
| 变异点 | 84 |

## 3.6 第四段：三对孪生工具，和编辑操作族（第 127–131 轮）

| 一对工具 | 谁判什么 | 守卫 |
|---|---|---|
| `uml_structure_verify` / `model_design_review` | 图的依赖形状（UML02x、MATRIX_*） / 设计自己声明的自洽（DES*） | `tests/des-vs-uml` |
| `model_interleaving_scan` / `model_compose_verify` | 挖断言、不证明（CONCURRENCY_*） / 对给定模型判 C1–C5 | `tests/scan-vs-compose` |
| `uml_review` / `model_verify` | 审建模（UML*，并指向验证） / 判行为（S*/A*） | `tests/review-vs-verify` |

三对共有的性质：**同一个输入，两套码，互不冒用**；且每一方都不得替对方说话（扫描器明写“不证明”，评审明写“去跑 model_verify”）。

### 编辑操作族（第 130 轮）

`tests/edit-refusals`（拒绝侧：零写入 + 逃生舱允许写入）与 `tests/edit-ops`（成功侧：六个操作各一次，读回文件）合成完整契约。

### 变异未命中的第三种原因（M88）

未命中前两次是“补丁没打上/打错地方”和“套件不在名单”，这次是第三种：**那一行根本没被执行**。

批次先删边、再删状态，`removeState` 里的“顺带删掉指向它的边”就无事可做，变异它当然不响。修法不是改变异，是**让用例的输入需要那条分支**：把被删状态自身的一条出边留到最后。

规则已写进 `tests/AGENTS.md`：未命中时除了问“在不在名单”，还要问“这个用例走到那行了吗”。

## 3.7 第五段：快照看不见的性质（第 132–135 轮）

一条渲染用例最容易被写成 snapshot：同一条源、同一份 SVG，以后每次比对字节。但有一类性质**快照永远看不见**——它在每一张快照里都成立，
却可能是巧合而不是设计。对付它的手法不是更大的语料，而是**对照组**：改动一个输入，要求输出按预期改变。

| 性质 | 对照手法 | 守卫 |
|---|---|---|
| 避让是障碍物引起的 | 同一堵墙**移进 / 移出**走廊：6 点 → 2 点 | `tests/route-causality` |
| 更高的盒子不压住下一层 | 长标签使盒高 27→42，**层间空隙保持 44**，下一层下移 | `tests/layout-growth` |
| 边连在朝向的边而不是盒子中心 | 竖向 `(64,73)→(64,117)`；横向 `(154,79.5)→(198,79.5)` | `tests/ports-sides` |

这一段的变异点全部在**对照组**上被抓：M89（无视障碍）、M90（层间空隙归零）、M91（锚点改为中心）。其中 M91 尤其说明问题——
**连在中心的边仍像一条连线、仍不穿盒、仍通过穿越扫描**，只有专门断言“不是中心”才能发现。

### 第五段基线（第 135 轮实测）

| 指标 | 数值 |
|---|---|
| 门禁命令 | 95 |
| 变异点 | 91 |

## 3.8 第六段：投影必须相等（第 136–139 轮）

同一份报告有几种面孔：**卡片**（`reportCard`，UI 先看到的）、**正文**（`renderReportText`，模型读的）、**full 视图**（整份 JSON）。三者不能各说各话，
否则“读了卡片的人”和“读了正文的人”会得出相反结论，而两边都自称在复述同一份报告。

| 相等关系 | 守卫 |
|---|---|
| 卡片的 `verdict`/计数/`first` == 报告的 | `tests/card-contract` |
| 卡片上的每个指针 == 已注册的工具 | `tests/card-contract` |
| 只有 diff 卡片带 `delta` | `tests/card-contract` |
| 正文首行 verdict == 卡片 verdict | `tests/card-vs-text` |
| diff 两处都先讲 delta，`CURRENT` 单独一行 | `tests/card-vs-text` |
| digest 与 full **结论相同**、digest 更短 | `tests/card-vs-text` |

### 这一段修掉的缺陷：卡片凭空声称有 delta

delta 无条件回退到 `report.summary`，而 summary 没有 delta 键，于是**每张卡片**都带 `added 0 / removed 0`——连普通验证报告也有。读者看到的是
“与基线相比没有新增问题”，而根本没有基线。修法：只有当 summary 真的携带 delta 键时才回退。

与第 118 轮 A3、第 128 轮 `CONCURRENCY_NO_CLAIM` 同族：**“没有发生的事”不能长得像“发生了且结果良好”**。

### 第六段基线（第 140 轮实测）

| 指标 | 数值 |
|---|---|
| 门禁命令 | 99 |
| 变异点 | 95 |

## 3.9 第七段：文档断言 → 用例（第 140–144 轮）

技能里的每一句结构断言，要么有一条用例，要么明确写着“不可测”。这一段把《怎么看报告》《怎么验证》里的断言逐条落地：

| 断言 | 守卫 |
|---|---|
| `CHECKS` 行是完整名单（含 pass 与 skip） | `tests/checks-line` |
| findings 在哪一族放在哪里；`nextSteps` 永不为空；设计评审三表不交叠 | `tests/reading-order` |
| 三态 verdict 与 `summary` 计数一致；`ok` 不可当 verdict | `tests/verdict-table` |
| 哈希跨运行、跨键序稳定，改模型则变；每族带 `hashSpec` | `tests/model-hash` |
| 每族一个 `schema` 名，互不重复，且都在注册表里 | `tests/schema-registry` |

### 这一段修掉的缺陷：数据模型报告不报 `hashSpec`

其他族都写着 `v1`，只有数据模型族返回了 `modelHash` 却不说明版本——规范化规则一改，旧哈希就换了含义，而读者没有东西可比。已补 `DATA_HASH_SPEC`，契约快照按新输出重录。

### 第七段基线（第 144 轮实测）

| 指标 | 数值 |
|---|---|
| 门禁命令 | 104 |
| 变异点 | 100 |

## 3.10 第八段：离开仓库之后还成立的契约（第 145–147 轮）

前七段都在验“还在仓库里的东西”。这一段验**会离开仓库的产物**：导出的四份模型文件、打包出去的客户端 bundle、以及 npm 包本身。

| 产物 | 契约 | 守卫 |
|---|---|---|
| UPPAAL / TLA+ / PRISM / SPIN | 敌意标识符不原样输出；净化碰撞被区分；带各自工具的骨架；自报出处 | `tests/export-artifacts` |
| `lib/client.js` | 生成器 banner；注册名 == 包名；向页面取 react 而非自带；两次构建字节相同 | `tests/client-bundle` |

### 这一段修掉的缺陷：TLA+ 模块不自报出处

另外三份产物都写着 `generated by this plugin`，TLA+ 没有——一份离开插件后无法追溯来源的文件，与人写的无法区分。已在模块内加 `\*` 注释行。

### 顺带确认的两件事实

- **完整构建可复现**：同一份 `src` 两次构建哈希一致；
  - `lib/` 下 187 个文件报 modified 但 `git diff` 为空，是**工作副本 CRLF** 噪声，不是构建漂移；
- **打包清单**：324 项，含 `lib/`、`src/`、`skills/`、`gate/`、`locale/`，不含 `tests/`。

### 第八段基线（第 147 轮实测）

| 指标 | 数值 |
|---|---|
| 门禁命令 | 106 |
| 变异点 | 102 |

## 4. 这一阶段修掉的真实缺陷

- `use-case` 关键字不在检测扫描里：一个表里写着 parseable 的家族**根本到不了**；
- 复合结构的自我分类器写成 `"c" as c`：往返多出一个 label；
- 解析分支先问“家族能不能解析”再问“记号能不能画”：Mermaid 的 `profile` 得到一句谈 PlantUML 的拒绝；
- 技能里的可画家族清单是表的副本：漏了两个真实可画的组合；
- 我自己把 `primaryKey` 当成字段标志：一份“合法”数据模型其实校验失败，报告的 `modelHash` 是空串——**断言把错误暴露出来**。
