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

- **挂载轮次已完整跑通（2026-10-16，`dsh 0.2.1-alpha.1`）**：装 → `--dump-config` 看到行（`enabled: true`）→ 技能与 `locale/` 在包内 → headless 启动止步 AUTH（说明整棵插件树加载通过）→ **从装好的副本跑出真实报告**（11 个工具全注册、`model_verify` 返回 `verdict: pass`、`schema: model-everything/verify/v1`、22 条检查）→ 卸载后行消失。脚本是 scratch 区 `model-everything-mount` 任务目录下的 `compat-round.ps1`，六步、插件参数化。此前只有 `0.2.0-rc.2` 的挂载与 0.1.7 的 API 面探针，**「装完跑一次真实调用」这步当时没做**，现在做了。
- `dsh.compatibility.dshReleases` 已按实测写回：`0.1.7-alpha.2`、`0.1.7-rc.1`、`0.1.7-rc.2`、`0.2.0-rc.2`、`0.2.1-alpha.1` 标 `compatible`；`0.2.0-rc.1`、`0.2.1-alpha.2` 仍是 `unknown`（没测过）。注意 `0.1.7-alpha.1` 装不上（npm 解析 `0.1.7-alpha.1` 那批包时 peer 冲突），不是本插件的问题。
- **区间内十个发行版全部实测通过（2026-10-16 扫描）**：`0.1.7-alpha.2`、`0.1.7-rc.1`、`0.1.7-rc.2`、`0.2.0-rc.1`、`0.2.0-rc.2`、`0.2.1-alpha.1` … `0.2.1-alpha.5`——每版都装一棵隔离 dsh 树（registry 装 `@deepseek-ai/dsh@<版本>`，约 60–80 秒）、跑完整六步轮次，十个全绿：挂载行在、`enabled: true`、技能与 `locale/` 在包内、headless 启动止步 AUTH、**从装好的副本跑出真实报告**（11 个工具 + `model_verify` 返回 `pass` / 22 条检查）、卸载后行消失。因此 `dshReleases` 现在把这十个都记为 `compatible`，**没有 `unknown` 了**。扫描脚本 `sweep-versions.ps1` 与轮次脚本 `compat-round.ps1` 同在 scratch 区 `model-everything-mount` 任务目录，都是插件参数化的。
- **`0.1.7-alpha.1` 不在区间内且装不上**（npm 解析那批包时 peer 冲突），不是本插件的问题；更老的 `0.1.2`–`0.1.6` 同样在区间外，未测。
- **仓库已建、已推（2026-10-17，仍是 private）**：`https://github.com/AmethystLuna/dsh-model-everything`，123 个提交，`main` 已跟踪 `origin`。走的是 SSH（https 推第一次 408 超时）。About 已配：中英双语描述（**GitHub 上限 350 字符**，第一版 470 被 422 拒了）、16 个 topic（照 logicprobe 的清单去掉多宿主的那几个：`claude-code` / `codex`）、MIT 已被识别。**homepage 故意留空**——npm 页面还不存在，填上去就是死链，发布时再补。
- **CI 首次运行抓到的两处缺陷（都已修）**：两次红都不是环境问题，是**度量依赖机器**。① `docs/toolset`、`docs/usage` 用**原始文件长度**量技能正文/参考资料，CRLF 检出比 LF 多算每个换行（79710→78897、155713→153640）；现在先 `replaceAll('\r\n','\n')` 再量，并且**在真 LF 树上验过**（`git -c core.autocrlf=false archive`，因为 `autocrlf=true` 时连 archive 都会写 CRLF，我第一次"LF 验证"是假的）。② `docs/usage` 去本机装的 dsh 里读 host 事实（目录行预算 500 等），runner 上没有 dsh → 写成 `unreadable` → 地图必然漂移；现在**没有 host 时回退到 `facts.json` 里已记录的值**（那是 host 的测量，不是这台机器的），有 host 仍然重新量。第三次推送后两矩阵全绿。
- **已发布（2026-10-18）**：`dsh-model-everything@0.1.0` 上了 npm，tag `v0.1.0` 已推，仓库转 public，GitHub Release 已建。发布物那一轮（tarball 装、按名从 registry 装）都在 [DSH-COMPATIBILITY.md](../../../DSH-COMPATIBILITY.md) 里有行。渠道状态见 [商店与目录上架](../design/store-entry.md)。
- **设计审阅专项已完成（2026-10-16）**：`model_design_review` + `DES1`-`DES11` + 技能 `model-everything-design`。细节见[设计审阅](../design/design-review.md)。**首次发布前版本一直停在 `0.1.0`**——没发布过就没有「版本推进」可言，semver 描述的是已发布版本之间的关系；记忆因此**不记当前版本号**，记住就会在首次发布时变错（见 RELEASE.md 的版本策略）。两处后续都做了：**最小反馈弧集**已真正算出（环核 ≤ 14 节点给证明过的最小值，超过退回剥离剩余并标 `feedbackArcsExact: false`）；`report_diff` **本来就兼容**设计报告（走 `checks[].findings` + `check.id` + 证据定位），无需改动，已实测（加环报 2 条新增、信号消失报 1 条移除）。
- **稳健性审查的缺陷修复（2026-10-16 完成 D1-D12）**：只读子代理跑完约 549 次调用，结论与 D1-D12 逐条见[稳健性审查](../design/robustness-audit.md)。**主缺陷族是「拼错的名称把检查静默关掉、然后报出正面的全部通过」**，三个引擎都中；D1-D12 全部修完并各有能红的用例，非机器族 UML 校验器审计也做完了。**贯穿的原则见该文件的「一条贯穿全部修复的原则」**：能用数学挡住的异常不要靠撞上才发现，而异常处理本身也是建模的审查结果。

## 待办（2026-10-16 用户指定，尚未开工）

| 待办 | 说明 | 状态 |
|---|---|---|
| **报告解读工具／方法论／技能** | 报告已经能产出，但「怎么读这份报告、先看什么、什么可以忽略」原先散在 skill 正文与 `references/` 里。现有：`skills/model-everything-report-reading/`（技能 + `references/reading-a-report.md` 与同名 `.mmd`）、`docs/report-reading/`（图生成器、测量事实 `facts.json`、技能路由图、同步检查）、`tests/report-reading/`。**没有加工具**——这是个有依据的决定：报告不缺字段（`reportView` 已能选 digest/full，`report_diff` 已能比较两份），加工具只会复述它要传达的指引。图见[技能路由图](../../../docs/report-reading/skill-routing.mmd)。 | **完成**（2026-10-17） |
| **社区贡献指南优化** | 仓库原先**根本没有贡献指南**（只有 `CODE_OF_CONDUCT.md`、CI 与 dependabot），所以是「从零写」而不是「优化」。现有 `CONTRIBUTING.md`（按两种情形分结构）、`.github/ISSUE_TEMPLATE/`（两种情形各一份模板 + `config.yml`）、`docs/contributing/`（由仓库测量的图与 `facts.json`）、`tests/contributing/`（七条：图不漂移、链接可达、计数与实际一致、门禁与 CI 一致、**引用的文献必须在仓库里有据**、两份模板各问对的东西、联系链接指向声明的仓库）。图见[贡献图](../../../docs/contributing/mindmap.mmd)。 | **完成**（2026-10-17） |
| **文档随新增内容更新** | 每一处新能力／新码／新行为都要落到对应文档，并保持中英成对。**本轮已补**：README 中英对各加了「报告解读」与「贡献指南」入口、补齐技能表（原先缺 design 与 report-reading 两行）、加入路由图与参考文献的入口；并把两处**不精确的 `ok` 说明**改成实测措辞（原先写「只表示工具跑过」，实测是各族历史语义不同）。**参考文献**：[docs/references.md](../../../docs/references.md)，由 `docs/references/generate.mjs` 从各 `Provenance` 表**逐字提取**，分「可核查的已发表工作 / 插件翻译的外部检查器 / **没有**已发表来源的检查」三节。**仍存缺口**：`skills/` 与 `docs/` 的参考资料目前只有英文（仓库规则要求中英成对的是 README 与 shipped text，参考资料的成对尚未开始）。 | **完成**（2026-10-17） |

**本轮的四张生成图**（都随测试守漂移）：`docs/routing-map.md`（技能/工具的文字分配）、`docs/report-reading/mindmap.mmd`（报告阅读方法）、`docs/report-reading/skill-routing.mmd`（该不该单独成技能）、`docs/contributing/mindmap.mmd`（贡献两种情形）、`docs/documentation/mindmap.mmd`（本次文档更新）。生成器的共同纪律：**从真实语料读、自检语法、拒绝产出坏图**；它们各自抓出过我的错误（写错的符号数、漂移的旧图、自己编的引用年份）。

- 上架目录：渠道、物料与状态见[商店与目录上架](../design/store-entry.md)。awesome 的 PR 只卡「仓库满 1 天」，会自己重跑；DSH-Store 的预检等机器人。`package.json` 的 `dsh.category` 是 `tools/dev`，但按[插件开发规范](../design/plugin-dev-spec.md) dsh 自己不读它，DSH-Store 从 manifest 与 README 派生，awesome 的分类写在它自己的 YAML 里——三处各写各的。
- CI 首次运行会验证三件事：Node 20 与 22 两个版本都过、markdownlint job 为绿、`lib/` 与 `src/` 同步（`git diff --exit-code -- lib`）。

**写作纪律（用户明确要求）**：**所有文档类内容的更新，都必须先有思维导图作为行文结构的指导**，再动笔。已用此法做过两次（`docs/routing-map.md` 的目录契约、`docs/report-reading/` 的解读指南，图都由脚本从真实语料生成，不是手画），并在写作规则的「禁止脆弱计数」上得过一次教训：`tests/structure` 的 guide 夹具原先写死一串码，加一个节点就断——现改为断言**顺序**并把重复码**对着图计数**。

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

机制是现成的：一个包可以用 `exports` 暴露多个子路径，`cordis.patch.yml` 一个组件插一行，每行可以单独 `disabled`；组件可以有自己的卡片名（`<子路径>/package.json` + 同目录 `locale/*.json`），跨组件只能走服务注入。可参照的实例是环境里已安装的一个多组件插件——多个独立组件，各有自己的 config，互不依赖。机制细节与判据见[插件开发规范](../design/plugin-dev-spec.md)。

拆的收益：只想要某一块能力的人，不必为全部工具的描述付出上下文；卡片上按组件列出，开关也按组件给。

拆的代价：技能要按组件分区，否则禁用某个组件后，技能里会指向不存在的工具（组件行注销时它的技能 provider 一起走，但入口技能的路由表还留着那条路）；工具注册测试要覆盖组合矩阵；插件卡片会从一个变成几个。

倾向：**暂不拆**。等出现明确的「只要图、不要引擎」的用户诉求，或工具描述的体积成为负担时再拆。

## 4. 较小的整理项

- **技能文档双语**：**样例已定**（`skills/model-everything-interleaving/SKILL.zh-CN.md`，七个技能里最小的一个）。格式与门禁都已落地：`tests/translation` 的 `PAIRS` 登记了这一对，`docs/README.md` 的语言政策新增一行——**模型只读 `SKILL.md`，`.zh-CN.md` 是给人读的**，所以它是同一份方法的可读副本，不是"技能的另一种语言版本"。门禁要求译文与英文**同标题、同表行数、同标识符集**，且中文占比 ≥15%（防止拿复制冒充翻译）。
  **剩下的量（决定要不要铺开前先看这个）**：其余六个 `SKILL.md` 共 76806 字符，参考资料共 156481 字符；其中 `model-everything` 一家（正文 37485 + 参考 78021）就占了一半以上。样例是 4138 字符，**铺 SKILL.md 约 19 倍，连参考一起铺约 56 倍**。建议只铺 `SKILL.md`、参考资料按需再议，并把 `model-everything` 单独作为一个决定（它一份顶其余六个）。

## 5. 部署面实测后剩下的缺口（2026-10-17，装进 desktop profile 实跑 + 一次只读复审）

前一批二十处已修（见 git `a4c3084`…`7f8550a`）。下表是**还没修的**，按伤害排序。标「已实测」的是我执行验证过的；其余来自只读代码复审（**未执行**，动手前先复现）。

| # | 缺口 | 状态 | 判据落点 |
|---|---|---|---|
| 1 | `model_compose_verify` 的 `rendezvous` 从不解析：拼错的名字、甚至传字符串 `"go"`，都静默跳过 C2，报告仍 `verdict=pass` + 「All rendezvous events can fire」 | **已修**（`91d53a1`）：未解析的名字出 `C2_RENDEZVOUS_UNRESOLVED`；字符串传参在工具层被 `COMPOSE_OPTION_INVALID` 拒绝 | `lib/engine.js` 的 `new Set(options.rendezvous ?? [])` 与 `if (!allEventsSet.has(event)) continue`；工具只校验了 `machines` |
| 2 | 检查内的搜索上限：`maxStates` 用尽后仍报「All … hold」，且没有 `*_UNDECIDED` | **已修**：五条 walk 都有第三态——`A14`（`b72a0fb`，walk 在函数体内，加标志）、`A12`（`7b0eab1`，辅助函数返回 `'undecided'`）、`S7`（`4384160`）、`A10`（`b088bf7`）、`A11`（`50e2703`）、`A7`（`4bb7a28`）。附带发现：`summary.truncated` 之前靠手写码表判定，`A12`/`A14` 的码不在表里 → finding 在而 `truncated=false`，已改为按 `_UNDECIDED` 后缀判定（`3d4cef3`） | 判据：walk 在函数体内 → 加 `capped` 标志；独立函数 → 三态返回。`InvariantViolation` 本来就带 `undecided` 字段，所以这几条**不需要**改签名，只需要把它填上 |
| 3 | `uml_parse` 默认正文不显示模型与告警，且自相矛盾：header 说「1 warning finding(s)」、下一行 `FINDINGS none` | **已修**（`c3feb34`）：正文有 `PARSE notation=… kind=… family=…` 与 `MODEL <json>`；解析器注记进了 `findings`（码就是引擎写在句首的那个），verdict 与名册同源 | `uml-tool.js` 的 `noteFindings`；`report-view.js` 的 `parseBodyLines`（只对 `action: 'parse'`：review 也带 model，但不该印） |
| 4 | 默认正文从不显示 `truncated` / `boundNotes` / `hashSpec` / `metadataKeys`；`narrativeCoverage` 的渲染分支用 `count()` 收数字，而引擎给的是 `"5/5"` 字符串 → 那行永远不出现 | **已修**（`a0cc797`）：正文现在有 `LIMIT`（truncated，置于清单之前）、`BOUND`、`hashSpec=`（跟在 hash 后面）、`METADATA`；覆盖率同时收数字与字符串。docs 生成器的样本模型加了 `_source`，否则 `metadataKeys` 不属于任何被测族、指南连名字都不许提——那条门禁正是它长期没被渲染的原因 | `report-view.js` 的 `headerLines` |
| 5 | `report_diff` 空 delta 走未知形状兜底，把整份 JSON 打出来；非空时 `changed` 被 `toViewFinding` 编造成 `severity: warning`，before/after 丢失 | **已修**（`b31da10`）：delta 按形状识别（不再要求列表非空），`CHANGED` 分别打印 before/after（`severity warning → error`）。冻结快照里原本就存着那段 JSON——兜底变成「文档里的答案」正是这么来的 | `report-view.js` 的 `isDelta` 与 `renderDeltaReport` |
| 6 | `report_diff` 判定只看 `added`：warning→error 升级不让 delta fail | **已修**（`b31da10`）：`diffOf` 收 `escalated`/`deescalated`，升级进 `verdictReason` 与 `nextSteps` 并使 delta `fail`；降级点名但不失败 | `baseline.js` 的 `diffOf` 与 `diffReports` |
| 7 | `communication` 族：接受结构族形状的模型，渲染出空文档，并发出描述「已画对象和箭头」的告警 | **已修**（`3204618`）：三条列表都不声明而声明了别的字段 → `UML041_MODEL_FAMILY_MISMATCH`（该码本来就有，只是只有带图的路径会发）；族的 `review` 现在先校验，根治了 `lifelines.length` 的 TypeError。`{schemaVersion:1}` 仍算空通信图（`UML063`） | `uml-communication.js` 的 `validateCommunicationModel` 与 `communicationModule.review` |
| 8 | `design` 的 `checksRun` 把 skip 计进去（verify/datamodel 已改为排除） | **已修**（`f2a43a6`）：只数跑过的；用例改成断言「跑过 = 总数 − skip」，原来的 `!== 12` 把 bug 写进了断言 | `design-engine.js` 的 `summary.checksRun` |
| 9 | `stateMapping` 形状不校验：字符串/数组被当成 identity 映射，静默产出假 D1 错误 | **已修**（`f2a43a6`）：工具层拒绝字符串/数组/非状态 id 的值，并拒绝「无 `beforeModel` 的映射」，码 `VERIFY_OPTION_INVALID` | `tool.js` 的 `execute`；`option-shape.js` |
| 10 | 导出族：UPPAAL 的 sync label 没有对应 `chan` 声明；PRISM 枚举超限被压成 `MODEL_INVALID`（合法模型被说成非法）；cost/maxTicks 等构造静默丢弃 | **已修**（`4398ff1`）：事件名改为 `comments` 标签（单模板的 `e!` 永远等不到对端，且 `chan` 未声明 → 文件根本加载不了）；`ExportError` 带 `EXPORT_TOO_LARGE`；`cost`/`maxTicks` 出 `EXPORT_FIELD_DROPPED`。导出套件里原本写着错的期望（`kind="synchronisation"`），已改为断言其不存在 | `exporters.js`；`export-tool.js` 的错误映射 |

**分类原则（决定拒绝怎么写）**：先分清是**输入意图本身出问题**（名字/记号不存在 → `UML_INPUT` / `UML_VIEW_UNREPRESENTABLE`），还是**模型与意图不符**（模型属于别的族 → 需要新码 `UML_MODEL_MISMATCH`，消息同时点名两边），还是**模型自身残缺**（缺字段/版本旧 → `UML_INPUT`）。第 7 条属于第二类，现在被吞成「成功但空」。

**结构性原因**：契约快照覆盖的行星不全——没有 compose、`uml_parse`、`uml_render`、export 工具层的用例。上面 3、4、5、7 能活下来，都是因为不在快照里。

**2026-10-17 收尾**：本表十行全部结案。结构性缺口本身也补了一半（`9a4d7c9`）：快照 runner 现在 `await` 用例构造器，因此可以调工具的 `execute`；新增四条用例——两条 compose（可解析的 rendezvous / 名字无人声明的 rendezvous）、一条 `uml_parse`（正文带 `PARSE`/`MODEL`）、一条 `model_export` 的 `EXPORT_TOO_LARGE` 拒绝；`errorCode` 进了投影，因为读者就是靠它路由拒绝。工具模块按 `tests/uml` 的方式动态载入，没有 devDependencies 时打印 SKIP 而不是让整个套件失败。

新用例当场抓到一处自相矛盾：`C2_RENDEZVOUS_UNRESOLVED` 是 `warning`，而同一份报告 `verdict=fail`、`summary.errors=1` —— 组合的计数把每条 finding 都当 error，于是正文说 `warn C2` / `[warning/…]`，上一行说 `1 error finding(s)`。现在 finding 是 error（调用方点名要查的握手没查成，不是通过），计数也只数自己带的 severity。

**工具层现在全覆盖**（`3c12bde`）：`model_verify`、`model_compose_verify`、`model_datamodel_verify`、`model_design_review`、`model_interleaving_scan`、`report_diff`、`model_export`、`uml_parse`、`uml_render`、`uml_review`、`uml_structure_verify` 都有用例了 —— 十一个工具，一条不缺。快照共 41 条，其中工具层 15 条。`errorCode` 在投影里，所以拒绝形状也被冻结。

冻结这些工具层用例时又抓到一处自相矛盾（`e40230c`）：`uml_parse` 把解析器注记放进 `warnings`、计进 verdict，却哪里都不印 —— 正文说「1 warning finding(s)」而下一行说「FINDINGS none — nothing was reported」。上一版的修法是把注记塞进 `findings`，但那与参考文档的说法（「a `UML_RENDER_APPROXIMATE_VIEW` warning」）冲突，还让每条注记在两个字段里重复。现在注记留在文档命名的通道上，由正文印出来（`WARNING` 行 + 空名册时说明「有几条注记在下面」）。

**这一批的教训（对第 2 行那类「报告说得比它知道的多」的缺口）**：判据不是「这个 walk 会不会停」，而是**停下来之后返回的是什么**。凡是 `undefined` 既表示「找过了，没有」又表示「没找完」的地方，报告就必然在两者之间选一个说法，而它选的总是更乐观的那个。修的时候先看 walk 的返回类型：`InvariantViolation` 自带 `undecided`，填上即可；`findBudgetViolation` 没有这个字段，才需要加 `'undecided'` 这一态。判据落错层两次都发生在这一步（引擎 vs 工具层、`uml_explain_labels` vs `uml_review`）。
