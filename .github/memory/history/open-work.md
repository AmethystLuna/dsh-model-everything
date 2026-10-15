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

- 装进目标 profile，跑一轮安装、挂载、离线检查、卸载。
- 实测 `dsh.compatibility.dshReleases`。现在只有 `0.2.0-rc.1`、`0.2.0-rc.2`、`0.2.1-alpha.1`、`0.2.1-alpha.2` 四个键，且全是 `unknown`；测过哪个就把哪个改成 `compatible`。
- 建 GitHub 仓库与 topic、`npm publish`、打 tag。
- 注册创意工坊商店条目：文案与分类备在[注册草稿](../design/store-entry.md)，分类填 `tools/dev`。`package.json` 的 `category` 现在写的是 `skill`，与社区索引的分类体系不一致，查规范时一并确认要不要改。
- CI 首次运行会验证三件事：Node 20 与 22 两个版本都过、markdownlint job 为绿、`lib/` 与 `src/` 同步（`git diff --exit-code -- lib`）。

## 2. 未实现的图族模块

`composite-structure`、`profile`、`timing`、`communication`、`interaction-overview` 目前**按名拒绝并给出理由**，没有模块。要真正 render / parse / review，按[架构](../design/architecture.md)加模块：在图族表补一条，再写一个 `UmlFamilyModule`。

动手前先读[记号调研](../research/uml-notation-support.md)，确认这种记号的表达能力支持你要做的事；表里 `faithful` 但本构建尚无模块的族，注册表会按名拒绝，不会交给错的解析器。

## 3. 用例族的 severity 校准（待核对）

[审阅清单](../research/uml-review-checklist.md)给出的判定依据是：include 成环是规范约束（应为 error）；只有 extend 成环只是风格问题（warning）；孤立 actor 是 info；actor 指向 actor 的关联是规范约束（error）。

要核对现有 `UML030`–`UML039` 的 severity 是否与之一致，不一致就改，并把结论回写到清单里（哪几条已被实现、实现成什么等级）。

## 4. 插件开发规范的调研（下一会话在创造模式里做）

写第 5 节时，多组件的做法是**从已安装的实例反推**的：`a neighbouring plugin` 用 `exports` 暴露四个子路径，`cordis.patch.yml` 一行一个组件，行级 `disabled` 各自独立。正式文档这次没有找到，这本身就是该查的证据。

下一会话有插件开发工具集，把规范读全，然后回写成一篇记忆——新开一篇，或补进[架构](../design/architecture.md)。要查清的至少有：

- bundle 与 patch 的正式语义：`dsh.bundle.patch`，loader 行的 `id` / `name` / `config` / `disabled`，以及 profile 各层 patch 的覆盖规则（按 id 覆盖整行 config，不做深合并）。
- 一包多组件：`exports` 子路径的约定，每个组件是否需要独立的 `package.json`，组件之间能否互相依赖。
- 配置 schema：schemastery 的用法，以及 `enabled` 之外哪些字段适合交给用户。
- 技能注册：`ctx.skills` filesystem provider 的注册方式；多组件时技能怎么分区。
- 模型可见目录：`cordis_inspect` provider 的 manifest 约定。
- 商店与元数据：`dsh.displayName`、`category`、`compatibility`、topic 的字段要求，以及 `dshReleases` 的实测方法。

产出要写「怎么做」，不写「我猜怎么做」。

## 5. 要不要拆成多个组件（待定）

现状：一个包、一行 loader 条目、`enabled` 一个总开关。

机制是现成的：一个包可以用 `exports` 暴露多个子路径，`cordis.patch.yml` 一个组件插一行，每行可以单独 `disabled`。可参照的实例是已安装的 `a neighbouring plugin`——四个独立组件（`a neighbouring plugin/shell`、`/file`、`/background`、`/ptc`），各有自己的 config，互不依赖。

拆的收益：只想要某一块能力的人，不必为全部工具的描述付出上下文；卡片上按组件列出，开关也按组件给。

拆的代价：技能要按组件分区，否则禁用某个组件后，技能里会指向不存在的工具；入口技能的路由表要处理「该工具未注册」；工具注册测试要覆盖组合矩阵；插件卡片会从一个变成几个。

倾向：**暂不拆**。等出现明确的「只要图、不要引擎」的用户诉求，或工具描述的体积成为负担时再拆。

## 6. 较小的整理项

- `examples/` 现在兼具测试夹具与示例两种身份。要分开就分，不分开也行（README 与 `package.json` 的 `files` 都已把它算进去）。
- `tests/external/run.mjs` 通过 `MODEL_EVERYTHING_SPIN` 与 `MODEL_EVERYTHING_GCC` 找 spin 与 gcc。这两个开关只在测试里用，README 没写；若希望别人也能在本地跑外部检查器往返，就该补进文档。
- markdownlint 目前靠 `npx --yes` 现取（CI 固定 0.42.0）。装成 devDependency 后本地也能跑，且与 CI 版本一致。
- 技能触发评估：旧仓库那份针对另一个宿主 CLI 的触发 harness 已随历史重建删除。要为 dsh 做触发评估就按 dsh 的技能目录行重写；五个提示词夹具可从历史备份包取回。
