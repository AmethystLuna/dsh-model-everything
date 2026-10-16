---
name: plugin-dev-spec
description: dsh 插件开发规范的实测结论——bundle 与 patch 语义、一包多组件、配置 schema、技能注册、模型可见目录、商店元数据与 release 实测办法
metadata:
  type: project
---

# dsh 插件开发规范（实测）

这篇是本仓库做 dsh 插件时依据的规范结论。每条都落到一个具体文件、字段或函数上，不用「通常如此」代替证据。

**怎么用**：改 `cordis.patch.yml`、改 `package.json` 的 `dsh` 块、动技能注册或 inspect provider 之前读对应那节。做发布挂载读第 1 节末尾与第 6 节。

## 证据来源

三处，都是本机可复读的：

1. **运行中的宿主**：`cordis_inspect_list` / `cordis_inspect_query`。它给出活的服务契约（`Service` provider 读 `skills`、`cordisInspect`），以及当前注册了哪些 inspect provider。
2. **已安装的 dsh 实现**：包内相对路径。`dsh-app-boot` 是 boot 与 patch 的权威实现，`cordis-plugin-loader` 是入口树，`dsh-package-manifest` 是清单类型，`schemastery` 是配置 schema，`dsh-skill-filesystem` 是技能 provider，`dsh-cordis-host-runner` 是 inspect 注册表。
3. **已安装的插件实例**：看它们的 `package.json`、`cordis.patch.yml`、`exports` 和 `locale/`。多组件的样本是 `dsh-ops`。

公开规范只在两处引用：[JSON Schema 2020-12](https://json-schema.org/draft/2020-12/schema)（实现里写死的 `$schema` 值）与 [schemastery](https://github.com/shigma/schemastery)。

---

## 1. bundle 与 patch

### `dsh.bundle.patch` 是什么

`package.json` 的 `dsh.bundle.patch` 指向包内的 patch 文件。dsh 启动时把它当**一层** patch 叠到 profile 的入口树上。
类型见 `dsh-package-manifest/lib/types/types.d.ts` 的 `DshBundleManifest`：一个路径字符串，或一个**按序应用**的路径数组。每个路径相对声明它的包根。

校验在 `dsh-app-boot/lib/index.js`：

- `bundlePatchFiles(bundle)`：不是字符串也不是字符串数组就抛 `dsh.bundle.patch must be a file path or a list of file paths`。
- `bundlePatchPaths(packageDir, bundle)` = 对每个文件做 `join(packageDir, file)`。
- `loadProfileDirectory` 把这一层的所有文件 `flatMap(loadOverlayPatches)` 后拼成**一个** layer。列表是有序的，不是一个文件一层。

### loader 行的字段

契约在 `cordis-plugin-loader/lib/types/config/entry.d.ts` 的 `EntryOptions`：

| 字段 | 含义 |
|---|---|
| `id` | 树内稳定 id。patch 用它寻址。省略时 loader 自己生成一个。 |
| `name` | 被 import 的模块说明符。insert 里的相对路径按 patch 文件所在目录转成 file URL；对已有行的 `name` 断言保持字面量。 |
| `config` | 传给插件的配置。 |
| `group` | 把这一行当作组，它的 `config` 是子行列表。只有组能被 insert 定位。 |
| `disabled` | 布尔或 `!!js` 表达式。停掉这一行及其全部后代。 |
| `inject` | 这一行要求的服务，或这一行的服务拦截配置。 |

`dsh-app-boot` 生成的 JSON Schema 里还多两个：`intercept`（对象或 null）与 `isolate`（对象或 null，值是 `true` 或字符串）。`isolate` 给一个 provider 和它的消费者一个隔离域。

### patch 只有两种形态

实现在 `dsh-app-boot/lib/index.js` 的 `applyEntryPatches`。这是 patch 的唯一语义，`--dump-config` 与真正挂载共用它。

**带 `insert`**：

- 没有 `id`：追加到根行列表末尾。
- 有 `id`：那个 id 必须已经存在，且必须是一个 `group`；否则警告并跳过（`patch insert: entry %C not found` / `is not a group`）。insert 的项目 push 进该组的 `config` 数组。

**不带 `insert`**：

- 必须有非空 `id`，否则警告 `patch: id is required for non-insert patches`。
- 按 id 找行；找不到就警告并跳过。
- 给了 `name` 就**断言**它与目标行的 `name` 相等，不相等就跳过。它不重命名。
- 然后其余每个键**整体赋值**到目标行：`target[key] = value`。

### 覆盖规则：按 id 覆盖，不深合并

因为赋值是按顶层键做的，`config` 是被**整块替换**的。这就是「按 id 覆盖整行 config、不做深合并」的出处——官方 schema 的描述原文同样是 `config is replaced wholesale, not deep-merged`。

三条容易踩的推论：

1. 后一层只想改 `config` 里一个字段，也必须把要保留的字段一起写全。
2. 后一层不写 `disabled`，前一层写的 `disabled` 就留着——因为它不是被覆盖的那个键。
3. 同一层里，后一个 patch 能命中前一个 patch 刚 insert 的行（`buildMap(insert)` 会为新行建索引）。

输入不被修改（先 `structuredClone`），所以热重载能回退掉一个被删掉的 patch。

### 层顺序

`readProfilePatches`（`dsh-app-boot/lib/index.js`）按这个顺序拼，**后一层赢**：

1. 各 bundle 层的 patches，按 `dsh.profile.bundles` 的顺序。
2. profile 自己的 `cordis.patch.yml`（常量 `PROFILE_PATCH_FILENAME`）。
3. `$DSH_HOME/cordis.patch.yml`。
4. `--patch` 叠加，可重复。

CLI 对 `--patch` 的说明就是 `extra patch-list overlay applied after the profile layer (repeatable)`。`!!js` 表达式在 boot 时求值。

### 发布挂载该怎么做

结论：**一个包一层一条 `insert`，行 id 用包名，就够了**。本仓库现在的 `cordis.patch.yml` 正是这个形状，注释里写的覆盖规则与实测一致。

要给别人留开关，靠两件事，别混：

- 想让人在 profile 里整行覆盖配置：他们写一条同 `id` 的 patch，把要保留的字段一起写全。
- 想让人只开关：他们只写 `id` 与 `disabled`，不用重述 `config`。Web 的插件页与 `plugin_manager` 走的就是这条路——`dsh-plugin-manager/lib/types/patch.js` 的 `writePluginEnabled` 只改 `disabled`，不改 `config`。

---

## 2. 一包多组件

### `exports` 子路径的约定

行里的 `name` 是普通模块说明符，由 Node 解析。`dsh-app-boot` 的 README 明说 `Node still owns exports, conditions, subpaths, module caches, and error codes`。所以一包多组件就是**普通的 `exports` 子路径**：`"./shell": { "default": "./lib/components/shell/index.js" }`，行里写 `name: dsh-ops/shell`。

每个子路径要导出什么，与单组件入口完全相同：cordis 插件模块，导出 `name` / `Config` / `apply`，以及可选的 `inject`。没有为子路径另设的契约。

### 每个组件是否需要独立 `package.json`

**为了被 import：不需要。** 解析走 Node 的 `exports`，与组件自己的 `package.json` 无关。

**为了在插件卡片上有自己的名字、描述和图标：需要。** 因为 `readPluginMeta(specifier, parentURL)`（`dsh-app-boot/lib/index.js`）是拿**完整说明符**（含子路径）去解析 `<specifier>/package.json` 与 `<specifier>/locale/en.json` 的。

`dsh-ops` 就是这么做的，三行一套：

- `"./shell"` → 入口模块。
- `"./shell/package.json"` → 组件自己的清单，里面只有 `name` / `description` / `icon` / `type`。注意它的 `name` 是给人看的标题，不是包名。
- `"./shell/locale/*.json"` → 组件的本地化文案。

它的 `cordis.patch.yml` 一行一个组件，各自带 `config`，`disabled` 各自独立。顶层 `dsh` 块只有 `bundle.patch`，没有 displayName 之类的字段——显示名全交给组件清单与 locale。

### 组件之间能否互相依赖

**没有「组件 A 依赖组件 B」这类声明。** 跨组件依赖只有一条路：Cordis 服务注入。

- 模块里 `export const inject = ['serviceName']`，或行里的 `inject` 字段。
- 被依赖的服务不在时，这一行**等待**，不是失败。`dsh-app-boot` README 的失败表写着 `An injected service is unavailable → Warn; continue while the entry waits for its dependencies`。

同一包内共用代码就是普通的相对 import。那是构建期依赖，loader 看不见：它不会让两个组件行互相牵连，禁用一个不会禁用另一个。

一句话：**要共用逻辑就共用代码，要共用状态就走服务注入。** 不要指望 loader 帮你排序。

---

## 3. 配置 schema

### 怎么写

插件模块导出 `Config`，类型是 `schemastery` 的 `Schema`。行里的 `config` 按它校验。

```ts
export const Config = z.object({
  enabled: z.boolean().default(true),
  interaction: z.union(['ask', 'auto', 'follow-approval']).default('follow-approval'),
})
```

### `enabled` 不是 dsh 给的字段

这是个容易搞错的地方，值得单独写清楚。

- dsh 的开关是**行级 `disabled`**。`EntryOptions` 里只有 `disabled`，没有 `enabled`。`writePluginEnabled` 写的是 `disabled: !enabled`。
- 本仓库 `config.enabled` 是插件**自己**声明的一个普通布尔字段，`cordis.patch.yml` 里 `config: { enabled: true }` 设的是它。它是否生效，取决于插件代码怎么读它。
- 两者都写着 `enabled`/`disabled`，但一个在 `config` 里，一个是行上的键。行级 `disabled` 会让插件根本不加载，`config.enabled` 只有在插件代码尊重它时才有效。

### 有哪些修饰符

`schemastery/lib/types/index.d.ts` 上可链式调用的：

| 类别 | 方法 |
|---|---|
| 校验 | `required()`、`pattern()`、`min()`、`max()`、`step()`、`loose()` |
| 取值 | `default()`、`volatile()`、`simplify()` |
| 文档与界面 | `description()`、`comment()`、`link()`、`role()`、`extra()`、`i18n()` |
| 表单呈现 | `hidden()`、`disabled()`、`collapse()`、`deprecated()`、`experimental()` |

哪些会进 JSON Schema 投影，看 `dsh-app-boot/lib/types/config-schema/types.d.ts` 的 `NativeConfigSchema.meta`：`role` / `extra` / `hidden` / `disabled` / `collapse` / `link` / `comment` / `badges` / `required` / `volatile` / `default` / `min` / `max` / `step` / `pattern` / `description` / `loose`。投影本身由 `createConfigProjector()`（`config-schema/projector.d.ts`）做，输出 JSON Schema 2020-12，`--dump-config-schema` 与 `Config` inspect provider 都读它。它**不执行** validator，也不填默认值。

`default` 与 `required` 互斥（schemastery README）。`.volatile()` 把字段解析成一个稳定引用，用 `.get()` 读；缺省值仍是普通数据，`simplify()` 会把引用解开展平以便持久化。

### `enabled` 之外哪些字段适合交给用户

判据是：**改变行为，但不破坏契约**。

适合交出去：

- 模式与策略枚举，例如本仓库的 `interaction`。用户改了它，报告的含义不变。
- 阈值与上限，例如超时毫秒数、条目上限。改大了只是更慢。
- 要不要注册某一组能力。这是拆组件之前唯一能给的粗粒度开关。

不该交出去：

- 路径、端口、home 目录。那些属于部署，写在 profile 里更合适。
- 内部常量，例如引擎接受的 schema 版本。用户改不动它，只能让报告对不上。
- 会改变报告 `schema` 或 `verdict` 语义的东西。报告是契约，契约不该由配置改。

校验失败时：可选行警告并继续，必需行停启动（`dsh-app-boot` README 的失败表）。

---

## 4. 技能注册

### 服务与入口

服务是 `ctx.skills`。用 `cordis_inspect_query` 读 `Service` provider 的 `skills` 能看到完整契约。两个注册入口：

- `registerProvider(create: (control) => SkillProvider)`：注册一个借出的同进程 provider。
- `register(skill: SkillRegistration)`：直接注册一个运行时技能。

### 文件系统 provider

官方实现是 `@deepseek-ai/dsh-skill-filesystem`，导出 `FileSystemSkillProvider` 类，也导出默认 `apply`（直接挂这一层插件就用默认的 `filesystem` provider）。

本仓库 `src/index.ts` 的用法：

```ts
export const inject = ['skills']

ctx.skills.registerProvider((control) => new FileSystemSkillProvider(ctx, control, {
  providerName: 'dsh-model-everything',
  includeDefaultRoots: false,
  customSkillDirs: [SKILLS_DIR],
}))
```

`includeDefaultRoots: false` 是关键：它让这个 provider 只看自己的 `customSkillDirs`，不去扫项目与用户目录，插件因此自包含。`SKILLS_DIR` 由 `fileURLToPath(new URL('../skills', import.meta.url))` 得到——`lib/index.js` 在包根下一层，`../skills` 落在包内，与安装位置无关。

### 根与优先级

`dsh-skill-filesystem/README.md` 给出 rank，小的先：

| rank | 来源 | 路径 |
|---|---|---|
| 100 | project-dsh | 项目根的 `.dsh/skills` |
| 200 | project-agents | 项目根的 `.agents/skills` |
| 300 | custom | `Config.customSkillDirs` |
| 400 | user-dsh | `$DSH_HOME/skills` |
| 500 | user-agents | `$DSH_AGENTS_HOME/skills` |
| 600 | bundled | `Config.bundledSkillDir` |

### SKILL.md 约定

- 形态二选一：目录包 `<name>/SKILL.md`，或根下的平铺文件 `<name>.md`。嵌套的 `**/SKILL.md` 故意不发现。
- frontmatter 必填 `name` 与 `description`；可选 `whenToUse`、`metadata`、`disable-model-invocation`、`user-invocable`。
- `disable-model-invocation: true` 让技能不进模型目录；`user-invocable: false` 让它不进人类命令。这两个键的写法很严，拼错或给了非布尔值会**整个丢弃**该技能并警告。
- 目录与正文分开加载：发现时只解析 frontmatter，每次取用时重读文件。改正文不需要失效缓存。

### 目录行只有 `description`，而且会被截断

目录里渲染的只有 `description`，`whenToUse` 不进目录行。它有长度上限，超出会被截断——本仓库 `tests/skills/run.mjs` 把这个上限记作 500 并按同样规则复现截断，超了就判红。

所以 `description` 的开头必须放触发词。本仓库的约定是整句以 `Use when` 开头。

### 多组件时技能怎么分区

机制的答案是：**provider 是每行的**。每个组件行可以注册自己的 provider，指向自己的子目录。分区要满足两条：

- `providerName` 在同层内必须唯一。重名会抛，因为 `registerProvider` 的同层重名是硬错误。
- 技能 `name` 也不能重。同一层内最近的层赢、同层内按 rank 决定。

真正的好处是**生命周期绑定**：`registerProvider` 返回的是 Cordis 的 effect disposer，禁用某个组件行就注销它的 provider，那些技能随之从目录消失。于是不会留下「技能还在、它指的工具已经不在了」这种悬挂入口。

这正是拆分的主要代价：**今天的技能是互相路由的**。入口技能的表格指向各领域技能，各领域技能末尾又指回入口。拆开后必须保证被禁用的那一组技能与指向它的路由同时消失，否则模型会被送去一个不存在的工具。

`tests/skills/run.mjs` 已经在守这条线：它扫 `src/*tool.ts` 里的工具名，要求每个注册的工具都出现在核心技能的表里和注入的 gate 里。技能一旦按组件分区，这个检查就得覆盖组合矩阵。

---

## 5. 模型可见目录（`cordis_inspect` provider）

### 注册接口

服务名 `cordisInspect`。宿主侧注册类型是 `HostCordisInspectProviderRegistration`（`dsh-cordis-host-runner/lib/types/inspect-registry.d.ts`）：

```ts
{
  manifest: CordisInspectProviderManifest
  query(method: string, input: JsonValue | undefined, context: { signal, agent }): Promise<JsonValue>
}
```

用 `ctx.cordisInspect.register(registration)` 注册，它返回一个幂等的 disposer。

### manifest 约定

字段在 `dsh-cordis-host-runner/lib/types/types.d.ts`：

| 字段 | 约束 |
|---|---|
| `id` | provider 身份。**在一个平台内唯一。** |
| `description` | 这个 provider 能回答什么、什么时候用它。 |
| `methods[]` | 显式列出的只读方法。 |
| `methods[].name` | 在**这个 provider 内**唯一。 |
| `methods[].description` | 这个方法返回什么、什么时候用。 |
| `methods[].inputSchema` | JSON Schema，方法接受的输入。 |
| `methods[].outputSchema` | JSON Schema，方法产出的输出。 |

`CordisInspectPlatform` 是 `'host'` 或 `'client'`。宿主插件注册 host provider，客户端目录由 `syncClientManifest` 镜像同步。已注册的 id 再注册会抛 `Host Cordis inspect provider "..." is already registered`（`inspect-registry.js`）。

### 本仓库怎么接

`inspect` 是可选服务，且 base bundle 的行可能在本行之后才挂载，所以注册要**先取再判空，并且重试**。`src/index.ts` 的做法：

```ts
const inspect = ctx.get('cordisInspect')
if (inspect === undefined) return
ctx.effect(() => inspect.register(inspectProvider(...)), '...')
```

外层在 `apply` 时试一次，并在 `agent/pre-step` 再试一次——那时 app 一定已经 boot 完。`ctx.get()` 返回 undefined 就直接返回，不要用硬依赖去 inject 它。

用法上：`cordis_inspect_list` 读目录，`cordis_inspect_query` 调一个方法。本会话的目录里能同时看到官方的 `Service` / `Event` / `Config` / `Tool`，以及插件注册进来的 provider。

### 与「要不要拆组件」的关系

provider 的 `id` 是**平台内唯一键**，不是每行一个。所以：

- 想让卡片上每个组件各有一个目录入口，就要给不同的 `id`。
- 想只留一个目录入口，就让一个组件持有 provider，其余组件不注册。让那一个 provider 的 `status` 方法把各组件是否注册都报出来，也是一种做法——本仓库现在的 `status` 就是这个形状。

**这构不成拆分的技术障碍。** 真正的耦合点是第 4 节的技能分区和第 2 节的卡片数量。

---

## 6. 商店与元数据

### dsh 真正读的 `dsh.*` 字段

完整清单来自 `dsh-package-manifest/lib/types/types.d.ts` 的 `DshManifest`。只有这些：

| 字段 | 类型 | 谁读 |
|---|---|---|
| `dsh.manifestVersion` | 字面量 `1` | 没有找到读者；README 明说安装器与 loader 都不强制它。 |
| `dsh.bundle.patch` | 字符串或字符串数组 | `dsh-app-boot` 的 `bundlePatchFiles` / `bundlePatchPaths`。 |
| `dsh.profile.bundles` | 有序包名数组 | `dsh-app-boot` 的 profile 加载与写回。 |
| `dsh.client` | `platform` 必填；可选 `inject` / `immediately` / `external` | `dsh-client-modules`。声明了就必须导出 `./client`，否则抛 `declares dsh.client but exports no "./client" bundle`。 |

`dsh` 块之外的：`name` / `version` 必填；`description` / `icon` / `private` / `dependencies` / `peerDependencies` / `engines` 可选。

### dsh 完全不读的字段

**`dsh.displayName`、`dsh.category`、`dsh.compatibility`（含 `dshReleases`）在已安装的 dsh 实现里没有任何读者。** grep 这三个名字，全部 `@deepseek-ai/*` 包的 `lib/` 零命中；它们也不在 `DshManifest` 里。

这不代表它们没用，只代表**读它们的不是 dsh**：可能是商店索引，可能是作者的校验脚本。别把「写进 package.json」当成「dsh 会照做」。

### 插件卡片的名字从哪来

来自 `readPluginMeta(specifier, parentURL)`（`dsh-app-boot/lib/index.js`）。它不加载插件代码，顺序是：

1. 解析 `<specifier>/locale/en.json`。拿不到就退到第 3 步。
2. 读**同目录**下所有 `.json`，语言 id 由文件名决定，并要求文件名是合法语言 id。每个文件读 `meta.title` 与 `meta.description`；给了空串或非字符串就抛。
3. 缺的字段回落到 `<specifier>/package.json` 的 `name` / `description`。标题最终回落为完整说明符，描述回落到空串。
4. `package.json.icon` 读成 data URL。SVG / PNG / JPEG / WebP，最大 256 KiB，且 realpath 之后必须还在清单目录内。
5. 失败不抛给调用者，而是返回带 `error` 的诊断，卡片照常可管理。

所以**要让卡片显示中文名，靠的是 `locale/en.json` 的 `meta.title`，不是 `dsh.displayName`**。这也解释了为什么每个组件要在 `exports` 里额外导出 `<子路径>/package.json` 与 `<子路径>/locale/*.json`。

一条硬约束：语言文件必须与 `en.json` 同目录，且要通过**完整说明符**解析得到。

### 商店的分类

dsh 实现里**没有**插件商店。目录来自一份社区索引，本仓库 [store-entry](store-entry.md) 记的是 `community.json`，字段为 `id` / `npm` / `name` / `nameEn` / `author` / `repo` / `category` / `subcategory` / `description` / `descriptionEn`。

分类词表里有 `tools/dev`、`tools/model`、`ui/*`、`knowledge/*`，**没有 `skill` 这一档**。所以 `package.json` 里的 `dsh.category: "skill"` 既不被 dsh 读，也不在商店词表里。

### GitHub topic

`topics` 在整个已安装 dsh 里只命中 LibreOffice 的无关文本。**topic 不被任何 dsh 代码读取**，它只是给人看和给外部搜索用的约定。

### `dshReleases` 的实测方法

这条是**本项目自己的规程**，不是 dsh 的机制——因为 dsh 不读 `dshReleases`。写在 [RELEASE.md](../../../RELEASE.md) 第 1、2 节。

一个 release 算「测过」的条件是：在它上面跑完一轮安装、挂载、boot-free 检查、卸载，并且能报出这个 release 的版本号。

具体命令：

1. 把 `DSH_HOME` 指到一个一次性目录。`RELEASE.md` 的硬要求：**绝不拿真实的那份去试挂载**。
2. `dsh plugin --profile <profile> add "file:<包目录>"`。`dsh plugin` 把非 DSH 自己的子命令原样交给 pnpm，所以这里就是 `pnpm add`。
3. `dsh --profile <profile> --dump-config`。期望看到这个插件的那一行，且 `enabled: true`。
4. 看会话目录里技能在、插件状态里工具已注册、跑一次真实调用拿到报告。
5. 卸载，删掉那个一次性目录。
6. `dsh -V`（或 `--version`）报出版本号，把这个 release 记进 `dsh.compatibility.dshReleases`，值写 `compatible`；没跑过的一律留 `unknown`。

**没有 `--offline` 开关。** dsh 自己把 dump 命令称作 offline config tooling——`dsh-app-boot/lib/index.js` 里 `applyEntryPatches` 的注释原文是 `shared by mounting (applyPatches) and offline config tooling (dsh --dump-config)`。

所以第 3 步的离线面就是 `--dump-config` / `--dump-default-config` / `--dump-config-schema`：只组装配置、不挂载插件、不联网。要看运行中的真相，用 `cordis_inspect_query` 读 `Config` provider 的 `listConfigs`，或读插件自己的 provider。

**旧 release 的廉价测法（API 面探针）。** 上面那一轮要一个能跑起来的宿主，适合测**当前**版本；要判断能不能**顺带兼容**一个旧 release，不必装整个宿主，把运行面单独跑一遍就够了：

1. 在 scratch 里 `npm install --prefix <dir> --no-save @deepseek-ai/dsh-tools@<版本> @deepseek-ai/dsh-llm@<版本> @deepseek-ai/dsh-skill-filesystem@<版本>`（外加 `@deepseek-ai/cordis`、`@deepseek-ai/schemastery` 供传递依赖解析）。
2. `npm run build`，把 `lib/` 复制进那个目录，再建一个空的 `skills/`（`lib/index.js` 按 `../skills` 找它）。
3. 跑一个小探针：造一个假 `ctx`（`get('tools')` 返回带 `register` 的对象、`get('cordisInspect')` 返回带 `register` 的对象、`effect` 直接执行工厂、`on` 空实现、`skills.registerProvider` 收下工厂），`await import('<dir>/lib/index.js')` 后调 `apply(ctx, { enabled: true })`；然后断言工具都注册上了、`inspect` 的 `status` 能答、某个工具真的 `execute` 出一份带 `verdict` 的报告、技能 provider 工厂能建出对象。
4. 全绿 = 这个 release 的 API 面没被这版代码用到不兼容的地方，可以把它的范围并进 `peerDependencies`。
5. 某个旧版本自己的包之间 peer 冲突（npm 报 ERESOLVE）属于那个版本的问题，不是本插件的结论：记下来、把地板放在能测通的那一个上。

2026-10 用这个方法测过 `0.1.7-alpha.2`、`0.1.7-rc.1`、`0.1.7-rc.2`：三者全绿，`peerDependencies` 的下界因此放到 `^0.1.7-alpha.2`。`0.1.7-alpha.1` 连自己的包都装不齐（ERESOLVE，`--legacy-peer-deps` 绕过后又缺传递依赖），所以没有把它写进范围。

### 准入看的是 `peerDependencies`，不是这几个字段

这是本节最该记住的一条：

- dsh 在导入插件前检查的是 **`peerDependencies`** 里的 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*`，函数是 `evaluatePluginCompatibility`（`dsh-app-boot/lib/types/plugin-compatibility.d.ts`）。每个声明的范围都必须匹配运行版本，预发布版参与范围匹配。
- **缺失**的 DSH peer 不构成约束。范围非法则判为不兼容。
- 不满足时：profile bundle 会被跳过并记进 `skippedBundles`；已经有 profile 时是整行被拒。
- 豁免写在 profile 自己的 `compatibility.json` 里，键是精确的 `包名@版本`，值是精确的 DSH 版本列表。`dsh plugin allow-version <包@版本> --dsh-version <版本> --accept-risk` 授权。插件升级或 dsh 升级都不继承授权。
- `engines.dsh` 与 `dsh.compatibility` 都是**声明**，不参与准入。`dsh-package-manifest` 的 README 原文：`Compatibility is declarative. Current installers and loaders do not enforce dsh.manifestVersion or engines.dsh.`

所以「兼容性靠实测」有两层含义：`dshReleases` 是给人看的记录，真正的准入闸门是 `peerDependencies` 的范围。

---

## 本仓库的现状与待办

按上面的规范对照 `package.json` 与 `cordis.patch.yml`，四处不一致：

1. **`./locale/*.json` 是一个死 export。** `exports` 里导出了它，但仓库里没有 `locale/` 目录，`files` 里也没有 `locale`。卡片名字现在拿不到本地化标题。
   两条路选一条：补上 `locale/en.json` 与 `locale/zh.json`（内容是 `{"meta":{"title":...,"description":...}}`）并把 `locale` 加进 `files`；或者删掉这个 export 别再指向不存在的东西。
2. **`dsh.category: "skill"`** 不被 dsh 读，也不在商店词表里。商店分类填在 `community.json` 的 `category` / `subcategory`（[store-entry](store-entry.md) 里备的是 `tools/dev` / `review`）。这个字段要么删，要么改成与商店一致以免误导。
3. **`dsh.displayName` 不被 dsh 读。** 卡片标题走 `locale/`。留着无害，但不能指望它。
4. **`dsh.compatibility` 与 `engines.dsh` 是声明。** 准入看 `peerDependencies`，本仓库已经在那里写了 `@deepseek-ai/dsh-*` 的范围，这是对的。`dshReleases` 里那几个 `unknown` 只有跑过才该改。

`cordis.patch.yml` 的注释与实测一致：一条 `insert`、行 id 用包名、`config.enabled` 是插件自己的字段。不用改。

### 在途决定 1：发布挂载

按第 1 节末尾做：保持一条 `insert`，行 id 用包名；把开关留给层叠的 `disabled`。要加组件时在同一个 `insert` 里多写几行，不要新开 `insert`。

### 在途决定 5：要不要拆成多组件

**现有证据支持暂不拆。** 理由：

- 拆的机制是现成的（第 2 节），成本不在机制上。
- 成本在技能：本仓库的技能互相路由，禁用一组就会留下指向不存在工具的入口。分区要同时保证 provider 唯一、技能名唯一、路由与工具同生共死（第 4 节）。
- 成本在检查：`tests/skills/run.mjs` 的「工具名必须出现在核心技能与 gate 里」这条要在组合矩阵上重写。
- 收益要等一个明确诉求才兑现：只要图、不要引擎的人，或工具描述的体积成为负担时。

什么时候该重估：出现「只要图、不要引擎」的真实用户诉求，或工具描述的体积成为真实负担。到那时按第 2 节写 `exports`、按第 4 节分区技能、按第 5 节决定 provider 是每个组件一个还是仍然只有一个。

---

## UNCONFIRMED

以下条目没有在本机找到权威依据，已列出搜索范围。**不要按猜测行事。**

1. **`dsh.displayName` / `dsh.category` / `dsh.compatibility` 是否被 dsh 之外的商店或索引读取。**
   搜过：整个已安装 dsh 实现的全部 `@deepseek-ai/*` 包的 `lib/`，grep `displayName`、`category`、`dshReleases`、`tools/dev`，无相关命中。社区索引 `community.json` 本身不在本机，无法读它。可以确定的是 dsh 不读；外部读者未知。
2. **GitHub topic 是否被任何 dsh 代码或商店读取。**
   搜过：整个已安装 dsh。grep `topics` 只命中 LibreOffice 的无关文本。因此 topic 至少不被 dsh 读；商店是否读未能确认。
3. **`dsh.client` 的 `inject` / `immediately` / `external` 三个字段的确切语义。**
   只确认了 `dsh-client-modules/lib/index.js` 的校验规则与「声明了就必须导出 `./client`」。这三个字段各自控制什么，`dsh-client-modules/README.md` 未逐条读。
4. **行字段 `intercept` 与 `isolate` 的完整语义。**
   只从 `dsh-app-boot` 生成的 JSON Schema 与 `EntryOptions` 确认了它们存在、类型是对象或 null。没读实现，因此不知道实战中怎么用。
5. **`dsh.manifestVersion` 的读者。**
   没找到任何读者。`dsh-package-manifest` 的 README 说安装器与 loader 都不强制它，`dsh-app-boot` 里也没有 `manifestVersion` 的命中。可能确实无人读。
6. **`@deepseek-ai/schemastery` 相对上游 `schemastery` 是否加了方法。**
   本机的 `NativeConfigSchema.meta` 里多出 `role` / `collapse` / `badges` 这类界面元数据，与上游 README 的方法表对得上，但没有逐条比对两边的 diff。
