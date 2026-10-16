# docs/ 里放什么，以及用什么语言写

这个目录**不随 npm 包发布**（`package.json` 的 `files` 是 `lib src skills cordis.patch.yml examples
locale`）。所以这里的读者**不是模型**，是维护者与贡献者。语言按**读者**定，不按目录定——

| 内容 | 读者 | 语言 | 为什么 |
|---|---|---|---|
| `skills/**`（技能正文与参考资料） | **模型** | 英文 | 目录行**截断在 500 字符**，正文占模型的上下文，而路由已实测 93/93 全对 |
| `README.md` / `README.en-US.md` | 用户 | **成对** | 门面，两边都要能读 |
| `CONTRIBUTING.md`、`.github/ISSUE_TEMPLATE/` | 贡献者 | 英文 | 公开仓库的门面，与 README 同侧 |
| `.github/memory/**` | 维护者 | **中文为主** | 素材是中文对话；`MEMORY.md` 写明「正文语言随素材」 |
| **`docs/**`** | **维护者** | **中文正文 + 英文标识符** | 见下 |

## `docs/` 的语言规则

**散文用中文，标识符逐字保持英文。**

字段名（`verdict`）、发现码（`S6_UNBOUNDED_VARIABLE`）、命令（`npm run test:engine`）、路径与
schema 串（`model-everything/verify/v1`）都是**标识符**——译了它们，文档就指向不存在的东西。译的
只有句子。

这条规则由 `tests/translation/run.mjs` 守着，不是靠自觉：它比对中英两份的标题层级与顺序、表格行数、
**每一个标识符是否逐字保留**、以及译文里有没有源文没有的标识符。

## 哪些文件不能译

| 文件 | 为什么不译 |
|---|---|
| `**/*.mjs` | 生成器与检查脚本，被测试执行 |
| `**/*.mmd` | 图本身；渲染出来的节点文字在这里**是内容**，而且生成器产出的就是英文 |
| `**/facts.json` | 测量事实，由测试**逐字节比对**；它是数据 |
| `references.md`、`routing-map.md` | **生成物**：由生成器从英文来源（技能、`src/`、语料）抽取或合成，译了就会与来源不一致 |

要给这些也做中文，路子不是翻译它们，而是**给生成器加语言参数**——那是一次独立改动，且必须让生成
器同时产出两份并各自被测试守住。

## 已有的中英对

| 英文 | 中文 | 说明 |
|---|---|---|
| [`docs/report-reading/guide.md`](report-reading/guide.md) | [`guide.zh-CN.md`](report-reading/guide.zh-CN.md) | 报告阅读方法；英文那份同时被发布到 `skills/model-everything-report-reading/references/` |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | [`docs/contributing/guide.zh-CN.md`](contributing/guide.zh-CN.md) | 贡献指南，两种来件 |
