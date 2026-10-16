---
name: design-review
description: 设计审阅引擎（DES1-DES11）：三级发现、可判与不可判的边界、原则映射与出处，以及为什么它不判「设计好不好」
metadata:
  type: design
---

# 设计审阅（`model_design_review`）

第四个引擎。验证引擎问「这台机器会不会走错」，数据引擎问「这份数据模型与迁移自洽吗」，
结构审阅问「这张依赖图与声明矩阵一致吗」；这一个问**「这份设计是否守住了它自己声明的契约」**
——分层、职责边界、职责归属、可替换性、接口宽度。判据不同、报告不同，所以是独立引擎与独立工具，
不是任何一个的 `mode`。

## 三级发现（读报告的第一件事）

| 级别 | 含义 | 决定 `verdict` 吗 |
|---|---|---|
| violation | 与**声明**矛盾。`DES1`、`DES2`、`DES3`、`DES5`、`DES6`、`DES7`、`DES9` | 是 |
| signal | 结构事实，**不声称它是错的**。`DES4`、`DES8`、`DES10`、`DES11` | 否（warning） |
| fact | 计数与算出来的结构，在 `facts` 里 | 否 |

`DESIGN_CODE_LEVEL` 是这张表的机器可读版本。分级的理由是：**「你违反了你的声明」与
「这个节点恰好承载了全部依赖」不是同一种话**，读者若分不清，就会把后者读成前者。

写入纪律：报告里**永远不出现**「该设计符合/不符合某原则」。出现的是
「`FixedDeposit` 禁止了 `withdraw`，而父类型 `Account` 声明该事件可发生」。

## 任一检查的判据

| 码 | 判据 | 需要的词汇 |
|---|---|---|
| `DES1_CYCLE` | 依赖图有环；附**不能被剥离的边**与最大互达组 | 图本身 |
| `DES2_LAYER_ORDER` | 跳层、反向边，或一个节点被两层同时认领 | `declare.layers` |
| `DES3_BOUNDARY_LEAK` | 跨越声明边界且无规则允许（deny 优先于 allow） | `declare.boundaries` + `allowedEdges` |
| `DES4_LOAD_BEARING_ELEMENT` | 割点或桥 | 图本身 |
| `DES5_UNDECLARED_NODE` | 节点不在任何声明的层或边界里 | `layers`/`boundaries` |
| `DES6_MISSING_REQUIRED_EDGE` | `requiredEdges` 里的边不存在 | `requiredEdges` |
| `DES7_LSP_CONTRACT` | 子类型禁止了父类型处理的事件；或继承来的操作元数变了（guard 文本不同只报 warning） | `extends` + `transitions`/`forbids` |
| `DES8_ISP_UNUSED_OPERATION` | 接口操作无人调用 | `interface` + `uses` |
| `DES9_ISP_DISJOINT_CLIENTS` | 调用方分成互不重叠的操作集合 | `interface` + `uses` |
| `DES10_RESPONSIBILITY_GAP` | 职责 tag 与依赖列表不一致（有依赖无归属／有职责无依赖／一个依赖被两个职责认领） | `responsibilities` |
| `DES11_CONCRETE_DEPENDENCY` | 抽象类型依赖了声明的具体类 | stereotype + `dependsOn` |

## 可判与不可判（这张表是本事的关键）

**有精确判据**（可判）：`DES7` 的
「子类型拒绝了父类型声明它处理的事件」＝ 前置条件被加强（[Liskov & Wing, *A Behavioral
Notion of Subtyping*, TOPLAS 1994](https://acm-stag.literatumonline.com/doi/10.1145/197320.197383)）；
`DES9` 的「两组调用方没有共同操作」＝ 一个接口其实是两个（Martin, *Agile Software
Development*, 2002；接口异常实证研究见
[interface design anomalies](https://ar5iv.labs.arxiv.org/html/1309.7950)）。
`DES1`/`DES4` 是标准图算法（强连通、割点/桥），确定且可复现。

**只有信号**：`DES7` 的 guard 文本差异——两个字符串无法判定前置条件是变强还是变弱；
`DES10` 的职责一致性——tags 与依赖一致只是**自洽的声明**，不是**好的划分**，名字是否诚实、
两个职责是否该合并，模型无法知道；`DES8` 的「无人调用」可能是给本模型之外的调用方留的。

**`skip` 不是 `pass`**：没声明分层就无从违反分层，报 `pass` 会被读成「分层已验证」。
`facts.checksSkipped` 列出它们，`nextSteps` 说明要补什么词汇。空词汇不是通过。

## 两处被实测推翻的写法（引以为戒）

1. **`DES4` 原名 `SINGLE_POINT_OF_FAILURE`**，实测一个守规矩的分层设计报了 6 条——链式分层里
   **每条边都是桥**。名字在喊「故障点」而消息说「这是事实」，属**假警报**。改名
   `LOAD_BEARING_ELEMENT`，并在消息里点名「articulation point」/「bridge」。
2. **反馈弧集的措辞**：有向 3 环做规范剥离后剩 **3** 条边（每个节点都有人依赖，剥离无处起步），
   而打断它需要 2 条。所以报告只说「这些边剥离不掉」，**不说「删这些」**；最小反馈弧集是
   NP-hard（Garey & Johnson 1979）。

## 为什么不做社区发现与模块度

上一轮专项探索时实测否掉的：标签传播在 10–30 节点图上**塌成一个社区**；Newman-Girvan 模块度
对**老实分层的图给出 −0.240**、对纠缠图给 0.000（小图退化 + 分辨率极限）。拿它报「你的模块化
不好」是错的。真正抓出「职责边界被穿透」的是**层次秩 + 秩差**（`DES2`）——该用序关系，不该用聚类。

## 拓扑学的边界（如实）

`DES1`/`DES4` 以及秩、扇入扇出、互达组都是**组合图论**，这也是架构建模审阅的既有路线。真正的
拓扑机器（同调、持续同调、Betti 数）用于几何数据与网表分析，**没有**「用于审阅 UML 或依赖图」
的成熟文献；本仓也未评估。要把它当单纯复形处理，得先定义有软件含义的 filtration，**没人定义过**。
图论里已能算而本仓未做的有：最小反馈弧集（NP-hard）、社区发现/谱聚类、介数中心性、圈复杂度
（本仓 `facts.cyclomatic` 已给）。

## 测试与验证强度

- 白盒套件 `tests/design-engine/run.mjs`：每码一正例 + 最邻近反例，另加校验器拒绝路径、
  确定性、元数据不改变结论、以及「引擎声明的码都有用例」的自检。
- 契约快照：`design:` 四条用例（守规矩的设计 / 违反声明的设计 / 只有图的裸模型 / 被 schema 拒绝的模型），
  fixture 在 `tests/fixtures/design.mjs`，与预览脚本 `tests/contracts/preview-design.mjs` **共用**。
- **突变检验**：`mutation-design.ps1`（scratch 区）对编译产物做 16 处突变，**16 全被抓、0 漏、0 坏**。
  它当场抓到一个真实用例缺口：`DES4` 的两条发射路径（割点／桥）原先是「代码出现过」就算过，
  而 fixture 同时有割点和桥，所以堵住任一条都不红；现已用「两三角形共点」（只有割点）与
  「单边两节点」（只有桥）**分开断言**。
- **突变检验本身的教训**：`find` 模式必须锚定**编译后**的文本（TypeScript 会把单行 `if` 的花括号
  去掉），且 PowerShell 单引号里的引号是 `''` 而非 `'''`；早期版本曾因此「什么都没改却报了结果」，
  以及过度转义导致一条突变被跳过。
