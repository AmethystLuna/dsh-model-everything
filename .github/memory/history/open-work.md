---
name: open-work
description: 交接待办清单：尚未完成的大项、待定的决定，以及每一项该由谁做、怎么做
metadata:
  type: project
---

# 交接待办清单

这里只放**还没做完**的事。做完一项就删一项，别留成历史；被否决的条目先写成一句结论放进 `design/`，再从清单里删。粒度按「下一个会话能直接开工」写。

发布与挂载那一步的命令清单在 [RELEASE.md](../../../RELEASE.md)，这里只记状态。

## 1. 发布与挂载（由具备插件开发工具集的会话做）

- **挂载已实测**：在隔离 `DSH_HOME` 里用 `dsh 0.2.0-rc.2` 装 `file:` 副本、`--dump-config` 看到本插件的行、技能与 `locale/` 都在包里；0.1.7 那一段另用 API 面探针测过（`peerDependencies` 区间因此放宽到 `^0.1.7-alpha.2`）。**还没做**：装完之后跑一次真实调用、以及卸载。
- `dsh.compatibility.dshReleases` 已按实测写回：`0.1.7-alpha.2`、`0.1.7-rc.1`、`0.1.7-rc.2`、`0.2.0-rc.2` 标 `compatible`；`0.2.0-rc.1`、`0.2.1-alpha.1`、`0.2.1-alpha.2` 仍是 `unknown`（没测过）。注意 `0.1.7-alpha.1` 装不上（npm 解析 `0.1.7-alpha.1` 那批包时 peer 冲突），不是本插件的问题。
- 建 GitHub 仓库与 topic、`npm publish`、打 tag。
- 注册创意工坊商店条目：文案与分类备在[注册草稿](../design/store-entry.md)，分类填 `tools/dev`。`package.json` 的 `dsh.category` 已改成 `tools/dev`——但按[插件开发规范](../design/plugin-dev-spec.md)，这个字段 dsh 自己不读，商店读不读未确认，注册时以商店表单为准。
- CI 首次运行会验证三件事：Node 20 与 22 两个版本都过、markdownlint job 为绿、`lib/` 与 `src/` 同步（`git diff --exit-code -- lib`）。

## 2. 图族模块：十四个族全部有实现路径

**没有「本构建没有模块」的族了。** 三个机器族（state / activity / sequence）走 `src/uml.ts` 的机器路径，其余十一个族各有一个 `UmlFamilyModule`，注册在 `FAMILY_MODULES`。剩下的拒绝都是**记号能力**的拒绝，不是实现缺失：

| 族 | 能力 | 拒绝什么、为什么 |
|---|---|---|
| `profile` | PlantUML 只画不读 | 记号没有 profile 元素，且「扩展」与「泛化」是同一根 `--\|>`（`parseable: false`） |
| `interaction-overview` | Mermaid 只画不读 | 画成流程图后节点只带名字，读回无法区分「引用别的图」与「内联交互」 |
| `sequence` | 不读 | 迹不能反推机器（`parseable: false`） |
| 其余 | 可画可读 | — |

**两族的拒绝理由曾经是错的，都改掉了。** 这是收尾这轮最有价值的发现：

- `communication`（`src/uml-communication.ts`）：原话是「两种记号都无法拼出消息编号与链接角色」。**错的**——[记号调研](../research/uml-notation-support.md)里那条实测写法就带着编号：`C --> O : 1: create`（编号写在箭头标签里）。过度断言「做不到」把一个本可实现的族锁死了。现已实现，往返无损。
- `interaction-overview`（`src/uml-interaction-overview.ts`）：原话是「两种记号都表达不出内联交互引用」。**也是错的**——PlantUML 的活动语法里有 `ref`，调研里 `start` / `:ref Login sequence;` / `if (ok?) then (yes)` 那条就是它。现已实现（画成 Mermaid 流程图，因为本构建拒绝 PlantUML 活动），读回按实际能力如实拒绝。

**教训**：过度断言「做不到」与过度承诺「做得到」是同一类缺陷，而前者更难被发现——它不会让任何测试变红，只会让能力表少一格。核证据要读调研与实测记号，不要相信自己上一轮的措辞。

`composite-structure` 与 `communication` 都走**近似视图却能读回**，为此图族表有 `parseThroughApproximation`：**能不能读回是实测事实，不是从 fidelity 标签推出来的**——判定曾用「是否 faithful」去推断，把这两个能用的视图关掉了。发现它的是白盒用例（`parseUml` 直接抛 `UML_VIEW_UNREPRESENTABLE`）。

三个族还各补了一条识别器线索，否则手写文本会被读成另一个族（能解析、但是另一个模型）：`plantumlCompositeSyntax`（端口声明）、`plantumlCommunicationSyntax`（带 `N:` 的箭头标签）、`plantumlErSyntax`（鸦脚基数 → **拒绝**，ER 不是 UML 族）。

动手前先读[记号调研](../research/uml-notation-support.md)，确认这种记号的表达能力支持你要做的事。注意记忆里那张总表把活动图标成「PlantUML faithful」，而**本构建**的图族表对 PlantUML 活动标的是 `none`（结构化流程语法无法承载带汇合或环的图）——以图族表为准。

### 每加一个图族，这几件事一起做（`timing` 那轮定下的清单）

`timing` 是照这个契约落地的第一个族（`src/uml-timing.ts` + `src/uml.ts` 的 `FAMILY_MODULES`）。它那轮踩过的顺序可以直接照抄：

1. **图族表**：`UML_FAMILIES` 里该族的 `mermaid` / `plantuml` 能力与 note 要与模块的实际行为一致（表说 `faithful` 而注册表按名拒绝，是违约）。
2. **模型与校验**：`XxxModelV1` + `validateXxxModel`，未知键与错类型一律 `UML_INPUT` 拒绝；**记号表达不出的字段不要进模型**。`timing` 第一版给 segment 带了 `to`（区间终点），PlantUML 语法里没有它，往返每次都丢；删掉之后才通。
3. **渲染**：记号说不出的东西用 `dsh-model-everything:` 指令承载（`timing` 用了 `timingUnit` / `timingLifeline` / `timingState` / `timingAtStart`），并且渲染必须确定（同一模型两次渲染逐字节相同）。
4. **解析**：不承载的构造按名进 `discardedConstructs`，绝不静默丢；渲染器写出的形态必须能被自己的解析器读回**同一个模型**。
5. **检查码**：另开一段空号，并把每个码写进 `design/uml-check-coverage.md` 的覆盖表。
6. **测试（白盒，缺一不可）**：往返逐字节稳定；手写（无指令）文本可解析；**每个检查码一条只产出该码的用例**（`UML049` 这类 info 允许共存）；校验器每条拒绝路径单独一条。`timing` 收尾时正是这套用例抓出四个真缺陷：`S1 @300` 取时取成了标识符里的 `1`、颜色剥离把引号内的 `#` 当成颜色分隔、`pulse`/`offset` 被静默吞掉、`has` 声明被读成状态变更。
7. **技能文档**：新码要在 `skills/` 里可查（`model-everything-uml/references/uml-modeling-guide.md` 各一节）。
8. **门禁**：`npm run build` 后 `lib/` 与 `src/` 同步；`test:engine` 与 `lint:md` 全绿。

## 3. 要不要拆成多个组件（待定）

现状：一个包、一行 loader 条目、一个总开关（本插件自己的 `config.enabled`；dsh 那一侧的开关是行级 `disabled`，两者别混）。

机制是现成的：一个包可以用 `exports` 暴露多个子路径，`cordis.patch.yml` 一个组件插一行，每行可以单独 `disabled`；组件可以有自己的卡片名（`<子路径>/package.json` + 同目录 `locale/*.json`），跨组件只能走服务注入。可参照的实例是已安装的 `dsh-ops`——四个独立组件，各有自己的 config，互不依赖。机制细节与判据见[插件开发规范](../design/plugin-dev-spec.md)。

拆的收益：只想要某一块能力的人，不必为全部工具的描述付出上下文；卡片上按组件列出，开关也按组件给。

拆的代价：技能要按组件分区，否则禁用某个组件后，技能里会指向不存在的工具（组件行注销时它的技能 provider 一起走，但入口技能的路由表还留着那条路）；工具注册测试要覆盖组合矩阵；插件卡片会从一个变成几个。

倾向：**暂不拆**。等出现明确的「只要图、不要引擎」的用户诉求，或工具描述的体积成为负担时再拆。

## 4. 较小的整理项

- 技能触发评估：旧仓库那份针对另一个宿主 CLI 的触发 harness 已随历史重建删除。要为 dsh 做触发评估就按 dsh 的技能目录行重写；五个提示词夹具可从历史备份包取回。
