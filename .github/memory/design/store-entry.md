---
name: store-entry
description: 商店与目录上架：真实存在的几个渠道、各自的提交方式与硬门槛、提交物料（含文案）与发布前后要补的证据
metadata:
  type: project
---

# 商店与目录上架

**前提先改一次：`community.json` 不存在。** 旧版这页写「社区索引 `community.json` 是创意工坊与 dsh-market 的唯一来源」——那是把一个**假设**写成了事实。查过之后，生态不是一个注册表，而是三层：目录站收录、市场/管理器装进 dsh、官方索引格式。能提交的渠道各自收各自的东西，没有一处叫 `community.json`。照旧稿去注册，会去找一个不存在的文件。

## 渠道与各自的提交方式

| 渠道 | 形态 | 提交方式 | 对我们最硬的那条 |
|---|---|---|---|
| [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | 精选目录，`dsh-market`、DSH Get 等从它读 | PR 加一个文件 `data/plugins/<owner>__<repo>.yml` | 描述**逐条对着代码核**；一个 PR 最多三条 |
| [DSH-Store](https://github.com/AI-Scarlett/DSH-Store)（dsh.store） | 装进 dsh 的商城与生命周期管理器 | 开一个 plugin-submission issue，只填公开仓库地址 | 来源钉死 40 位 commit；每个 DSH 版本要独立的安装/启动/卸载证据 |
| [OMDSH Hub](https://github.com/omdsh-dev/dsh-hub-workshop)（hub.omdsh.dev） | 市场 | 按仓库 `INTAKE.md` 提交 | **INTAKE 未读**——提交前先读，别按猜的填 |
| [deepseek-harness-plugin-manager](https://github.com/hrhgit/deepseek-harness-plugin-manager) | 管理器，自动发现 | 不用提交 | 要有 npm 包且 `repository` 回指仓库；靠 `dsh-plugin` topic 发现 |
| [dshbase.com](https://dshbase.com/zh/about/) | 独立实测目录 | 邮件 / issue | 作者亲自装一遍，标「已验证/未验证」 |
| [DSH Get](https://www.dshget.com/) | 聚合站，每天抓上游 | 不用提交 | 进了上游就出现 |
| 官方「自定义插件市场」 | **索引格式**，不是商店 | 不发；DSH-Store 自己发 | `plugin-market.json`，`format: 1`，dsh `0.2.1-alpha.4` 起可加索引源 |

`dsh-webui-market-plugin`、`dsh-market-sidebar` 是读这些目录的界面，不单独收稿。`dsh.deepseek404.com` 规则没读到，不算渠道。

## 提交物料

### awesome-dsh-plugin

一个文件，`data/plugins/AmethystLuna__dsh-model-everything.yml`：

```yaml
url: https://github.com/AmethystLuna/dsh-model-everything
name: AmethystLuna/dsh-model-everything
category: dev
description:
  en: Turns what a design or a document claims into a model, then decides it - UML diagrams, state machines and protocols, data models and migrations, concurrency claims, dependency graphs, report diffs.
  zh: 把设计或文档里的断言抽成模型再判定——UML 图、状态机与协议、数据模型与迁移、并发断言、依赖图、报告对比。
```

`category: dev` 是挑的，不是判的：`dev` 是开发与运行时，`tools` 是通用工具能力；本插件面向的是「审阅正在开发的东西」，所以 `dev`。维护者会自己改分类，不会因此打回。

**`en` 里不写数字、不写工具名。** 规则原文是「描述被当作声明，会对着代码核」——写了「11 个工具」就会被数；写了 `model_verify` 就会被点。上面这句一个可核的整数都没有，但每一条都能在仓库里找到对应能力。

### DSH-Store

issue 正文只有仓库地址；如果有多个插件才补 `Plugin path`（本仓库只有根包，留空）。标题 `[Plugin] https://github.com/AmethystLuna/dsh-model-everything`，可选的 Notes 写一句它凭什么值得上架。

机器人读**默认分支当前的 HEAD**，八小时策略再过一轮更严的门禁。它会核：公开、版本、许可证、`dsh.bundle.patch`、入口 id、生命周期脚本（我们没有）、受保护命名空间（我们没有）、以及 manifest 里声明的兼容范围——所以 `dsh.compatibility` 与 README 的「环境要求 / 权限与数据」两节**必须在提交前就是真的**，它们会被读。

**Runtime Verified 只能靠发布后的一轮**：那个状态绑定具体 DSH 版本、系统、Profile、时间与公开证据，单元测试不算。工作树上的轮次再漂亮也填不上这一格。

### 其余

- **OMDSH**：先读 `INTAKE.md`。已知的是它只把 `dsh-plugin` topic 当**候选**，而 awesome 列表、文档仓、模板一律排除——所以「上了 awesome」不等于「OMDSH 会收」。
- **dshbase**：邮件或 issue，附作者自测结论；它按实测标状态，不按星数。
- **DSH Get**：等上游。它抓 awesome、hrhgit、OMDSH 与 GitHub topic，去重后发布；我们不推。

## 上架前的硬门槛（一次核对完）

1. 仓库**公开**；`cordis.patch.yml` 在根，`dsh.bundle.patch` 指得到；
2. 入口 id 唯一，不冒用、不覆盖 `@deepseek-ai/*` 与官方清单；
3. npm 包已发布，且 `repository` 回指本仓库（否则下载量与归属都不关联）；
4. `dsh-plugin` topic 在；
5. **无生命周期脚本**——八小时自动策略放行的前提；
6. README 写了用途、安装、外部依赖、风险、**权限**与 DSH/Node 兼容范围；确认不了的要写「未知」；
7. `peerDependencies` 的每个范围都带**该元组的预发布分支**（`^0.2.1-alpha.1` 这类）。这条曾被 awesome 的指南单独警告：看着很宽的范围会静默排除所有预发布，用户 `npm install` 时撞 `ERESOLVE`；
8. `DSH-COMPATIBILITY.md` 有发布物的那一行（发布后补）；
9. 截图可选：仓库根 `screenshots.json`，1–8 张，只收 GitHub 托管的图；不写就从 README 抽。

## 文案

橱窗里显示的**不是本文件的字段**，是各渠道自己抓的：awesome 用上面那行 `en`，DSH-Store 用 manifest + README 派生，npm 用 `package.json` 的 `description`。

中英短描述仍值得留着，因为 dshbase 这类目录要人写：

| | |
|---|---|
| 名称 | 设计与代码的建模/自动化审查 |
| nameEn | Modeling / Automated Review for Designs and Code |
| 一句话 | 自动化审查替代反复试错——省下的 token，留给设计。文档与源码交叉验证；行为与流程建模核查。 |

**为什么这么排**（换词时先读这段，别只换字）：

1. 第一句放收益，第二句给做法。列表里前十几个字决定眼睛停不停；紧跟做法，读者不会只看到口号。
2. 第二句取对偶：「文档与源码交叉验证」对「行为与流程建模核查」，两个六字短语，节奏齐。代价是丢掉了「交给引擎跑」——由第一句的「自动化审查」承担；README 的 bullet 仍用「交给引擎跑」，橱窗讲节奏、文档讲机制。
3. 用「核查」不用「核验」：与第一句的「审查」同一语感层次。英文跟 `checked`；要更强的技术语感可换 `verified`。
4. 不写「替代模型推理」：枚举断言、把设计抽成模型、把发现落回源码，仍然是推理；被替代的是反复试错。写过头，用户第一次用就发现名不副实。
5. 不写「断言」「核验」「证据」「原语」，不写 `file:line`：橱窗里讲「落到具体哪一行」，要精确的人点进 README。
6. 分类不能落 `tools/model`——那里的 model 指大模型（本地模型、模型顺序、自动模型分层）。本插件是 `tools/dev`。
