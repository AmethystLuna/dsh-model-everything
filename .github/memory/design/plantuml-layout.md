---
name: plantuml-layout
description: 选 PlantUML 作卡片语言的真正理由（布局可控）、今天的行为矩阵（支持 / 进 ignored / 按行拒收）、P1–P4 的落地状态与各自的验收用例，以及转置布局必须用读者坐标系判断的两条坑
metadata:
  type: design
---

# PlantUML 与布局控制

> 上级：[INDEX-design.md](../INDEX-design.md)　·　什么时候读：决定卡片用哪种记号写、给布局加一条约束、或评估「换 PlantUML 值不值」之前

选 PlantUML 不是因为它画得好看，而是因为它把**结构**写进源码：`package`/`component` 块说明归属，
`as` 给节点短别名，边可以指向块本身。Mermaid 也能画同一张图，但归属靠缩进、别名靠重复声明。

**但今天两套记号的排版是同一条管线**：解析成同一个 `Diagram`（节点/边/组），再走同一套分层布局与绘制。
实测同一条四节点链，两者 SVG 除标签文字外逐字节相同；`flowchart TD` 与 `flowchart LR` 的 SVG 也完全相同。
所以「换语言」目前换到的是**可读性与可核对性**，不是排版自由度——自由度要靠下面 P1–P4 一步步加。

## 今天的行为（逐个构造实测）

| 构造 | PlantUML 里的意思 | 今天 |
|---|---|---|
| `component`/`node`/`rectangle`/`artifact`/`state` | 普通元素 | 支持，圆角矩形 |
| `database`/`entity` | 数据存储 | 支持，圆柱 |
| `usecase` | 用例 | 支持，椭圆 |
| `class`/`object`/`interface`/`enum`/`annotation` | 带分隔栏的盒子 | 支持为**命名盒子**，分隔栏按行拒收 |
| `note`/`file`/`card` | 折角盒子 | 支持；`note` 折右上，`file` 折右上同形，`card` 折左上 |
| `frame` | 页签盒子 | 支持，名字写进页签 |
| `queue`/`stack`/`storage` | 容器 | 支持：半圆封口 / 顶部层线 / 弧形顶边 |
| `boundary`/`control`/`collections` | 角色盒子 | 支持，角标记号（双竖线 / 圆 / 方） |
| `package`/`folder`/`node`/`component`/`rectangle`/`artifact` 块 | 边界 | 支持，可嵌套；**构造型与颜色在取名前剥掉**（留在标签里会让别名丢失，边就指不到边界） |
| `state "名字" as X { }` | 复合状态 | 支持，画成**实线**边界（包是虚线） |
| `-->` `..>` `<\|--` `\|>` `*--` `o--` `--` `*..` `o..`，可带 `: label` | 关联/依赖/泛化/实现/组合/聚合/无头连线 | 支持；**单破折号 `->` 也是箭头**；两端都带记号的边按行拒收 |
| 端点上的基数、颜色、构造型（`a "1" --> "*" b`、`a #red --> b`、`a <<e>> --> b`） | 端点修饰 | 在取名字之前剥掉：**它们不是名字的一部分**（否则会得到 `a "1"` 这种谁也指不到的 id） |
| `component "文字" as X`、`package "文字" as P { }` | 别名 | 支持，别名是边引用的 id |
| `[*] --> A` | 起点 | 支持 |
| `title` | 标题 | 支持 |
| `header`/`caption`/`footer`，单行或 `… end header` 块形式 | 页面文本 | 支持，行数决定占用的带高；块内文字**不进图** |

页面家具全叠在一起时（表头 + 标题 + 图 + 图例 + 来源图注 + 页脚 + 渲染器计数）实测是**一条 15px 节奏**：header@32、title@48、
legend@176、来源图注@207、页脚@222、机器计数@237，画布 240×269，无挤压——所以“叠放间距”没有再单独加规则。
| `legend` … `end legend` | 图例块 | 支持，画在图下、图注之上，**不参与布局**；`legend right` 等角位进 `ignored` |
| `left to right direction`（PlantUML）与 `flowchart LR`（Mermaid） | 全局方向 | **支持**：测量转置后跑同一条管线，末尾把画布转回来 |
| `top to bottom direction` | 全局方向 | 接受但无效果（本来就是自上而下），进 `ignored` |
| `-right->` `-down->` `-up->` `-left->` | 逐边方向 | **支持**；横排下方向词按读者坐标读（right 仍是向右） |
| `-[hidden]->` | 只参与排版、不画的边 | **支持**：照常排名，恒不绘制 |
| `together { }` | 同一层成组 | **支持**：成员拉到组内最深一行 |
| `together { a b }`（裸名字，不声明） | 同层成组 | **支持**：块内裸名字与箭头端点一样成为（隐式）元素 |
| `together { }` 空块 / 只点名一个 | 无效果 | 进 `ignored`，各带自己的理由；**不静默吞掉**（且报告在“空图提前返回”之前发出） |
| `together` 套 `together`、`together` 里放一个 `package` | 嵌套 | 已知限制：行关系按外层块计算，内层成员不并入同一行（未实现，先记录） |
| `note right of X : 文字` 等四个方位 | 紧邻某盒的注释 | 支持：注释画成折角盒子，方位通过一条**隐形边 + 方向提示**实现 |
| `note right of X` … `end note` | 块形式的注释 | 支持：块先行收集并改写成单行形式，块内各行合成一段文字，**不进图** |
| `note as N` … `end note` | 带别名的注释块 | 支持：块收集后改写成 `note "文字" as N` |
| `note "x" as N #colour` | 注释底色 | 颜色被剥掉并进 `ignored`（配色固定）；**文字必须保留**——之前连文字一起丢了 |
| 标签里的 `\n` | 换行 | 当作真实换行（`explicitLines` 本来就按换行切分） |
| `note over X` | 覆盖在盒子上方的注释 | 按行拒收：没有任何边能表达“压在盒子上” |
| `actor`/`participant`/`cloud`/`agent` | 序列图记号与云朵 | 按行拒收：没有对应轮廓 |
| 序列图语句（`alt`/`opt`/`loop`/`par` …） | 时间轴片段 | 按行拒收 |
| `skinparam backgroundColor #rrggbb` | 画布底色 | 支持：只改纸，不改排布；非十六进制颜色按行拒收 |
| 机器图注（`plantuml, N boxes…`） | 图注 | 源文本自带 `caption` 时**不画**；只在带拒收计数时与作者图注并列，因为那是作者说不出的信息 |
| 图注语言 | 语言 | 恒为英文：它与工具报告同属“产物元数据”，不随源文本语言走（见下方决定） |
| `title 文字` / `title` … `end title` | 图题 | 支持：单行或块；块内各行合成多行标题，行数决定标题带高度，块内文字**不进图** |
| `scale N`（0.5–8） | 交付尺寸 | 支持：只把 `width`/`height` 乘 N，`viewBox` 保持布局尺寸，图内坐标不动 |
| `scale 200 width` 之类按宽高定尺、或超出 0.5–8 | 缩放 | 按行拒收，并给出可写形式 `scale 2` |
| 其它 `skinparam`（字号/字体/阴影…）、`!theme` | 样式 | 进 `ignored`，带行号，理由写明“字号与配色是固定的” |
| `hide …` / `show …` | 隐藏 | 进 `ignored`，理由写明“这里没有可隐藏的东西：元素不带分栏与构造型” |
| `!pragma layout` / `top to bottom direction` | 布局控制 | 进 `ignored`，理由写明“排版由本渲染器决定” |
| `!define` / `!theme` / 其它 `!pragma` | 预处理 | 进 `ignored`，理由写明“这里不展开，源文本按原样绘制” |
| `allowmixing` / 裸 `together` | 无效果 | 进 `ignored`，各带自己的理由（只画一个族 / 没点名任何盒子） |
| `!include` | 引入文件 | **按行拒收**：完全不读文件，静默丢掉会让图看起来完整而实际缺内容 |

拒收都带行号（`line N: …`），画不了的行点名报出来，而不是画半张图。`ignored` 是第三类：读懂了、没有效果、
并且**明确说出来**——源码说了什么而图里没有，读者必须知道。

## 同一个记号，同一个答案（第 14–15 轮实测）

图是**模型**，不是记号。同一张图分别用 PlantUML 和 Mermaid 写，必须得到同一个模型：节点与标签、边的两端与种类与
虚实、分组的标签与归属。第 14 轮测出两处分叉并修掉：

| 记号 | PlantUML | Mermaid（修前） | 现在 |
|---|---|---|---|
| `-->` | `association` | 不记种类 | 两边都记 `association` |
| `-.->` / `..>` | `dependency` + dashed | 无头虚线 | 两边都 `dependency` + dashed |
| `---` / `--` | `none` | 不记种类 | 两边都 `none` |
| `==>` | 按行拒收 | 画成虚线 | 两边都按行拒收（粗线不画） |

第 15 轮把覆盖面扩到：跨包边、包内边、嵌套包、自环、中文标签——全部一致。

**唯一允许的差异是分组的 id**：PlantUML 可以用 `as` 起稳定别名，Mermaid 的分组 id 是按位置编的
（`subgraph-1`）。位置编号是刻意的：改名时 id 不变，结构 diff 才能报「重命名」而不是「删一个加一个」。
所以等价性比较的是读者看得见的部分（标签、父标签、成员），不是两套记法各自编的 id。

## 规模边界（第 17 轮实测）

| 形状 | 25 节点 | 50 | 100 | 200 |
|---|---|---|---|---|
| 链 | 67ms / 656×547 | 69ms | 418ms / 1360×973 | 2402ms / 2064×1257 |
| 扇出 | 16ms / 2960×192 | 21ms | 68ms / 11810×192 | **260ms / 23610×192** |
| 分层（每层 5） | 25ms / 598×661 | 92ms | 288ms / 1302×1087 | — |

两个结论，都写进了行为而不是注释里：

- **热点已定位并消除**（第 18 轮）：`node --cpu-prof` 在 200 边扇出上取样，`sharedLength` 占 **97%**（7775ms / 8013ms）。
  它在 separation pass 里被每个候选位移调用一次，每次都扫全图所有配对。改成**按路线分解**：维护每条路线与其它路线的
  共享长度（row），试算时只重算被移动那一条的 row（`shared - row[at] + 新 row`），接受移动后重建全部 row。
  同一份图**逐字节相同**（19 格验收图 + 60 边扇出共 20 张，改前改后 20/20 一致），扇出 200 边 **8.1s → 0.26s**（31×），
  100 边 1.2s → 68ms。
- **教训**：分解必须对“移动一条路线会改变别人那一行”这件事诚实——第一版只更新被移动的 row，20 张图里有 4 张变了；
  改成接受移动后重建全部 row，才回到逐字节相同。
- **链状图的热点是走线，不是分离**（第 19 轮）：百节点链 418ms，`routeEdge` 占 61%（337ms），`blocked` 8.6%。
  没有优化它：候选通道枚举里没有可证明「不影响选择」的剪枝，而 100 节点的链在真实文档里不常见（10–30 节点约 50ms）。
  记录在这里，供下次有证据时再动；`the same source renders to the same bytes` 与 `a large drawing still finishes in a click`
  两道闸会挡住回退（后者用 8s 的宽上限，只挡数量级回退，不挡机器负载）。

- **宽层的画布没有上界**：分带只切 rank，切不开一个 rank 里的 200 个盒子，于是宽度到 23610px。做法是**如实报告**：
  超过 4000px 时工具报告打一条 `SIZE`，说明尺寸与成因（同一层盒子太多），而不是裁掉或缩放。

## 同一输入，同一字节（第 16 轮实测）

渲染必须是确定的：同一份源码，任何时候、任何顺序渲染，输出逐字节相同。测到的三件事：

- 19 格验收图**两个独立进程**各渲一遍，`Compare-Object` 无差异；
- 同一进程内**逆序重渲**，逐图哈希不变（没有跨调用的状态泄漏）；
- `execute` 的 SVG 与 `render` 的 markup **逐字节相同**，两次 `execute` 的报告文本也相同。

语料里有一条 `the same source renders to the same bytes` 守着它：三个代表性源（横排+together+隐藏边、状态机自环、
30 节点长链）先渲一遍，再在其它图之后逆序重渲，要求字节相同。所有快照测试都建立在这条性质上。

## 转置布局的坑（第 10 轮实测）

横排不是第二套引擎：`place()` 把每个盒子的宽高对调后跑同一条纵向管线，`paintWith` 最后把画布 `(x,y)→(y,x)`
转回来。能这么做的前提是**每个以几何为依据的决策都问过「这是在谁的坐标系里」**。已经踩过的两个：

- **分带（wrap）必须用读者坐标系判断**。转置前 rank 往下堆，一张横排图在规划器眼里永远是「高条」，于是它
  开了第二条带；转置后这条带落在第一列下面，根节点还会被画进包里。结论：横排图不分带（请求就是向右长）。
- **方向词按读者坐标读**。`-right->` 在横排下仍要「右边」；直接套用转置后的行列语义会让盒子跑到下面。
- **页面家具属于页面坐标，不属于布局坐标**。横排是一次整图转置：表头、标题、图例、图注若跟着转，表头会落进图里、图例会跑到右边缘、
  两条图注会叠在同一行。它们必须在转置之后沿页面左边缘重排（表头 → 标题 → 图 → 图例 → 来源图注 → 页脚 → 机器计数），
  并且转置后的内容整体落到标题带之下（`+ topOffset`），否则第一个盒子压在标题上。
  复杂横排图（S：横排 + 嵌套包 + `together` + 隐藏边）在修复后目视复核过：两个虚线包并排、包内盒子居中、三条跨包连线都走
  「出边 → 竖走 → 入边」，无穿框、无重合、边标签落在自己的线上。
  进布局前做一次 90° 映射（right↔down、up↔left）。

同一条管线的其他约束仍然成立：端口间距按边实际能容纳的跨度收缩（永不重合）、短于 6px 的横向台阶并掉、
注释的长文本与其它盒子一样**走同一套换行**（32 字实测折成两行、盒子长到 222×42，没有溢出）——不需要为注释单开一条文本规则。
标签找不到干净位置时如实报 `LABELS`。

## 引擎能被约束的地方（已实现）

- **分层**（`layer.ts`）：由边决定 rank，环先断（`cycle-break.ts`）；`mergeRanks` 把 `together` 的成员拉到组内最深一行。
- **层内顺序**（`order.ts`）：中位数扫描 + 贪心交换；`orderRowPairs` 在排序后把 `-right->`/`-left->` 声明的先后摆正。
- **方向**（`place.ts` + `paint.ts`）：`left to right direction` 与 Mermaid 的 `LR` 走同一条管线，测量转置、画布转回。
- **走线**（`coords.ts`/`route.ts`/`paint.ts`）：正交走线、端口打包、短台阶合并、穿盒修复。
- `folded` 仍是唯一与「读图」有关的开关（把一组折成一个盒子），不是布局约束。

## 四项约束的落地状态（P1–P4）

| 项 | 落地成什么 | 验收它的语料用例 |
|---|---|---|
| P1 `together` | 解析预扫描收集成员 → `mergeRanks` 拉到同一行 | `together puts its members on one row` |
| P2 `-[hidden]->` | 照常参与排名，绘制前跳过（不占端口、不画线） | `a hidden edge ranks two boxes the way it points and draws nothing` |
| P3 `left to right direction` | 实体宽高对调 → 同一条管线 → 画布 `(x,y)→(y,x)`；标题与图注按页面锚定 | `left to right direction lays the chain out along a row`、`a turned drawing grows along the page and keeps its packages` |
| P4 `-up-/-down-/-left-/-right->` | `up` 反转排名两端；`right`/`left` 进同行组并由 `orderRowPairs` 摆正 | `a direction hint decides where the far box goes`、`a direction hint means the same thing in a turned drawing` |

矛盾约束的成规兑现了：`together` 造成的排序环由 `coords.ts` 的 `placing` 集合丢弃一条，而不是无限递归。

## 缺陷注入：哪道闸门真的会红（第 20–21 轮实测）

`node tools/mutation.mjs` 会往 `src/` 里种一个缺陷、跑绘图相关的套件、再用 git 还原，**没被任何套件抓到就退出码 1**。
它要求工作区干净，不进入 `npm run check`（它会改写工作区）。当前八个注入点与抓到它们的闸门：

| 注入 | 闸门 |
|---|---|
| M1 关掉 separation pass | `no two routes draw the same line`（plantuml-corpus，2 条） |
| M2 端口打包改回固定间距 | `two edges never leave one side from the same point`（plantuml-corpus） |
| M3 关掉短台阶合并 | `no route carries a jog shorter than a pen width`（plantuml-corpus） |
| M4 Mermaid 粗线又画成虚线 | 记号等价性 + `a dashed mermaid edge…`（plantuml-corpus、diagram） |
| M5 分离段只更新被移动那一行 | 扇出路由快照（plantuml-corpus，2 条） |
| M6 交叉数恒为 0 | `tests/ordering`（3 条） |
| M7 走廊贴着盒子边取 | `tests/render`（2 条） |
| M8 折叠边界不生效 | `tests/diagram`（11 条） |
| M9 读了 `header` 却不画 | 页面文本用例（plantuml-corpus） |
| M10 读了 `legend` 块却不画 | `a legend block is text under the drawing…`（plantuml-corpus） |
| M11 定位注释的隐形边被画出来 | `a note beside a box lands on the side the source named`（plantuml-corpus） |

补这两道闸门之前，M1 与 M5 是**全绿**的：没有断言的 pass 等于装饰，而一个真修过的 bug 没有快照就等于没修。

工具本身踩过一个坑，值得记：`execFileSync('npm', …)` 在 Windows 上启动不了 `npm.cmd`，构建静默没跑，于是八个注入点
全部“通过”——变异检查对着旧 `lib/` 跑，给出最糟的答案。改成把命令拼成一个字符串交给 shell 才正确，并顺手避开了
`shell: true` + 参数数组的弃用告警。

## 测试与风险

- 每个构造一条**正例**（画出来）与一条**近似反例**（该拒收的仍拒收，且行号正确）。
- 约束类改动要**变形检查**：加 `together` / hidden 边只允许改变 rank 与顺序，不允许改变节点集合、标签、形状。
- 几何缺陷要**量化**：共线、斜线、穿盒、短于 6px 的台阶、端口重合、标签压线——六项在六张大图与十九格验收图上
  都必须为 0；`LABELS` 非零时如实上报，不假装修好。
- 不做的：序列图族（`actor`/`participant`/`alt`…）、`cloud`/`agent` 的轮廓、真正的 PlantUML 兼容层。
