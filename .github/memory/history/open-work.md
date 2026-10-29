---
name: open-work
description: 交接待办清单：还没做完的两个决定、已完成项的去处、写文档前的那条纪律
metadata:
  type: project
---

# 交接待办清单

这里只放**还没做完**的事。做完一项就地删掉，别留成历史；被否决的条目先写成一句结论放进 `design/`，
再从清单里删。2026-10-29 清理时已结案的那一批，快照在[归档](../../../archive/README.md)里。

## 现在的状态

- 已发布 **0.5.2**，`main` 干净，`npm run check` 全绿。发行流程见 [RELEASE.md](../../../RELEASE.md)，
  每一版的兼容性证据见 [DSH-COMPATIBILITY.md](../../../DSH-COMPATIBILITY.md)。
- 渲染器这一轮的现状、**改了但没测**的地方与下一步顺序，见[渲染流水线交接](2026-10-render-handover.md)。
  那一篇同时是接手渲染工作的起点。
- 加能力该动哪些文件、由哪个套件守着，见 [docs/feature-checklist.md](../../../docs/feature-checklist.md)。

## 未完成

### 1. 要不要拆成多个组件（待定）

现状：一个包、一行 loader 条目、一个总开关（本插件自己的 `config.enabled`；dsh 那一侧的开关是行级
`disabled`，两者别混）。事实上已经按行拆过两次：路由注入一行（`…-gate`），画图一行（`…-diagram`）。
还没拆的是**工具面**：全部工具仍共用一行。

机制是现成的：一个包可以用 `exports` 暴露多个子路径，`cordis.patch.yml` 一个组件插一行，每行可以单独
`disabled`；组件可以有自己的卡片名（`<子路径>/package.json` + 同目录 `locale/*.json`），跨组件只能走服务
注入。机制细节与判据见[插件开发规范](../design/plugin-dev-spec.md)。

拆的收益：只想要某一块能力的人，不必为全部工具的描述付出上下文；卡片上按组件列出，开关也按组件给。

拆的代价：技能要按组件分区，否则禁用某个组件后，技能里会指向不存在的工具（组件行注销时它的技能
provider 一起走，但入口技能的路由表还留着那条路）；工具注册测试要覆盖组合矩阵；插件卡片会从一个变成几个。

倾向：**仍不拆**。等出现明确的「只要图、不要引擎」的用户诉求，或工具描述的体积成为负担时再拆。

### 2. 技能正文的中文副本（样例已定，未铺开）

样例是 `skills/model-everything-interleaving/SKILL.zh-CN.md`——域技能里最小的一个。格式与门禁都已落地：
`tests/translation` 的 `PAIRS` 登记了这一对，`docs/README.md` 的语言政策写明**模型只读 `SKILL.md`，
`.zh-CN.md` 是给人读的**，所以它是同一份方法的可读副本，不是「技能的另一种语言版本」。门禁要求译文与
英文同标题、同表行数、同标识符集，且中文占比 ≥15%（防止拿复制冒充翻译）。

要铺开的量：其余 `SKILL.md` 合计约是样例的 19 倍，连参考资料一起铺约 56 倍；其中入口技能
`model-everything` 一家（正文加参考）就占了一半以上。

建议：只铺 `SKILL.md`，参考资料按需再议；入口技能单独作为一个决定（它一份顶其余六个）。

## 已结案的去处

| 曾经在这里 | 现在在哪 |
|---|---|
| 发布、挂载轮次、兼容性区间扫描、商店与目录上架 | [RELEASE.md](../../../RELEASE.md)、[DSH-COMPATIBILITY.md](../../../DSH-COMPATIBILITY.md)、[商店与目录上架](../design/store-entry.md) |
| 部署面实跑查出的缺口（两种拒绝形状、两处静默读作通过） | [部署面](../design/deployed-surface.md)；逐条修复与判据落点见[稳健性审查](../design/robustness-audit.md) |
| 十四个图族的实现状态、拒绝理由，以及「每加一族做什么」 | 实现与拒绝理由：[UML 检查码覆盖与编号](../design/uml-check-coverage.md)；动作清单：[docs/feature-checklist.md](../../../docs/feature-checklist.md) 的 *A UML diagram family* |
| 记号能力（哪个族在哪种记号里能画、能读） | [记号覆盖调研](../research/uml-notation-support.md) |
| `modelPath` 评测结果、设计审阅专项、稳健性审查 D1–D12 | 各自的主题文件；结论已落在技能正文与 `tests/` 里 |

## 写作纪律

**所有文档类内容的更新，都必须先有思维导图作为行文结构的指导**，再动笔。用户明确要求，而且它付过账：
图改变过写什么，不止一次暴露出正文里写错的数字。已用此法做过的图都在 `docs/` 下，由脚本从真实语料生成。
