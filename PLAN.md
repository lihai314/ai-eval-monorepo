# ai-eval-monorepo 从 0 到 1 落地方案

> 定位：以「GitHub issue → PR → CI → 部署 → 监控」这条研发链路为骨架，学习 agent 应用开发。
> 约束：TypeScript 全栈、框架优先（Vercel AI SDK）、只用免费额度、账号已就绪。

---

## 1. 产品形态（一条决策，解决所有含糊）

做一个 **issue-triage agent**（代号 `issue-pilot`），部署在自己的 monorepo 上吃自己的狗粮：

- 仓库里每新开一个 GitHub issue → agent 自动：**分类 + 打 label + 摘要 + 检索相似历史 issue（pgvector）** → 回帖。
- 附带一个极简 Web UI：看 triage 历史、重跑、人工点赞/点踩（反馈进 eval 数据集）。

为什么是它：
1. issue 既是触发器又是数据集，研发链路（issue→PR→CI）和产品功能天然咬合，不需要另编一个场景。
2. 输入输出都是「非结构化 → 结构化」，是学 agent（tool calling、structured output）最典型的形态。
3. 你的仓库本来就要攒 issue，eval 数据集零成本增长。

## 2. 技术选型（全部免费额度内）

| 环节 | 选择 | 免费额度依据 |
|---|---|---|
| Monorepo | pnpm workspace + Turborepo | — |
| Web/后端 | Next.js (App Router) on Vercel | Hobby 计划，个人项目免费 |
| Agent 框架 | **Vercel AI SDK**（`ai` 包） | 开源；TS 生态里最顺的 tool-calling / streaming / structured output |
| LLM | Provider 无关，默认 **Gemini**（AI Studio 免费层）；模型名走 env | 免费额度；换 key 即换 OpenAI/智谱等 |
| Embedding | `text-embedding-004`（Gemini，免费）或 OpenAI small | — |
| 数据库 | **Supabase**：Postgres + pgvector + Auth（GitHub OAuth） | 免费：500MB DB、2 项目 |
| ORM/迁移 | Drizzle + drizzle-kit | 轻量、TS-first |
| 校验 | zod（schema 全放 `packages/shared`，前后端共用） | — |
| 质量门禁 | Biome（lint+format 一把梭）+ Vitest | — |
| CI/CD | GitHub Actions（issue 触发 + PR 门禁） | 公开仓库无限；私有 2000 min/月 |
| LLM 可观测 | **Langfuse Cloud**（trace + score + prompt 版本） | 免费 50k events/月 |
| 错误监控 | Sentry（Node/Next SDK） | 免费 5k errors/月 |
| 站点分析/健康检查 | Vercel Analytics + 每日 cron 冒烟测试 | Hobby cron 限每日一次，够用 |

**刻意不选**：LangGraph（TS 生态弱、概念重，框架优先学习阶段是噪音）、Temporal/消息队列（用 Actions + cron 就够）、自托管 Grafana/OTel（免费额度养不起，且会把学习变成运维）。等 P5 之后想加深再换。

## 3. 仓库结构

```
ai-eval-monorepo/
├─ apps/
│  └─ web/                 # Next.js：UI + /api/triage + /api/webhooks/github
├─ packages/
│  ├─ agent/               # agent 核心：prompts、tools、triageAgent()，纯函数、无框架依赖
│  ├─ db/                  # drizzle schema + 迁移 + client（issues, triage_runs, eval_runs）
│  ├─ shared/              # zod schemas、类型、env 校验（唯一配置入口）
│  ├─ eval/                # ★ 本仓库灵魂：数据集、graders、runner
│  └─ config/              # tsconfig/biome 共享配置
├─ .github/
│  ├─ workflows/
│  │  ├─ ci.yml            # PR: lint + typecheck + test + build
│  │  ├─ eval.yml          # prompt/agent 代码变更时跑 eval 门禁
│  │  └─ triage.yml        # issues: opened → 调 Vercel API → 回帖+打label
│  ├─ ISSUE_TEMPLATE/      # bug / feature 模板
│  └─ PULL_REQUEST_TEMPLATE.md
├─ turbo.json
├─ pnpm-workspace.yaml
└─ PLAN.md                 # 本文件
```

依赖方向铁律：`agent` 不 import `web`；`web` 和 `eval` 都只依赖 `agent + db + shared`。这保证 eval 能脱离 UI 在 CI 里跑。

## 4. 路线图：P0 → P5（每阶段都有「完成判据」）

### P0 · 骨架上线（半天）
- 初始化 pnpm workspace + Turborepo + Next.js 空应用 + Biome + strict tsconfig。
- Vercel 连仓库 → 空应用上生产；建 Supabase 项目，跑第一个迁移。
- GitHub 开仓库 + 首个 commit 即配好 `ci.yml`（lint/build/test 绿灯）。
- **判据**：浏览器打开 Vercel 域名看到 hello；CI 绿。

### P1 · 第一个 agent 端点（1–2 天）
- 从第一个「真实 issue」开分支 `feat/triage-api-1`，做 `POST /api/triage`：
  AI SDK `generateObject` + zod → 返回 `{category, labels[], summary, severity}`；结果写 Supabase。
- prompts 和 tools 全部放 `packages/agent`，配 Vitest 单测（mock LLM 输出）。
- 开 PR：preview 部署可访问 → CI 过 → merge → 生产。
- **判据**：curl 一个 issue 返回结构化结果且库里落了行；你亲手走完一次 issue→PR→deploy。

### P2 · 链路接通 + 狗粮（1–2 天）
- `triage.yml`：`on: issues.opened` → 用 PAT 调 `/api/triage` → 以 bot 身份回帖 + 打 label。
- Supabase 启用 pgvector；issue 正文 embedding 入库，triage 时检索 top-3 相似历史 issue 注入 prompt（学 RAG 的最低成本入口）。
- 给自己仓库的 issue 模板写好，从此每个新功能都从 issue 开始。
- **判据**：在本仓库开一个测试 issue，1 分钟内收到 agent 回帖和 label。

### P3 · eval 体系（2–3 天，本仓库灵魂）
- `packages/eval`：
  - `datasets/triage-v1.jsonl`：30–50 条标注样例（前期用 P2 跑过、人工确认过的真实 issue，零标注成本）。
  - `graders/`：程序化断言（label ∈ 白名单、summary ≤ N 字）+ **model-graded**（用另一个 LLM 评分类正确性 1–5）。
  - `runner`：`pnpm eval`，结果写 `eval_runs` 表 + Langfuse score。
- `eval.yml`：PR 触碰 `packages/agent/prompts/**` 或模型版本时自动跑，回归（均分低于基线）则红。
- **判据**：故意把 prompt 改坏，PR 被 eval 门禁拦下——这一刻你就懂为什么要 eval。

### P4 · 监控与回滚（1–2 天）
- Langfuse：agent 每次调用上报 trace（input/output/latency/tokens/cost），与 eval score 关联。
- Sentry：web + 后台任务错误捕获，release 绑定 commit。
- Vercel Analytics + 每日 cron 冒烟测试（打 `/api/triage`，失败发 issue 给自己）。
- 演练：部署一个故意抛错的版本 → 从 Sentry/Langfuse 发现 → Vercel 一键回滚。
- **判据**：一次「发现→回滚」演练成功，截图贴进相关 issue。

### P5 · 加深（持续，按兴趣挑）
- 人工反馈闭环：回帖带 👍/👎，反馈自动进 eval 数据集（数据飞轮）。
- prompt 版本管理（Langfuse prompt API）、多 agent（加一个 "reproduce guidance" agent 给 bug issue 生成复现步骤建议）。
- 回归趋势 dashboard（从 `eval_runs` 表画曲线）。
- 想换口味时：把 P1 的 generateObject 换成手写 tool-loop，对比框架帮你做了什么。

## 5. issue → PR 工作流约定（学规范，不搞仪式感）

1. `main` 受保护，只进 PR；每个功能/修复先开 issue（哪怕三行字）。
2. 分支 `feat/<name>-<issue号>` / `fix/<name>-<issue号>`；PR 描述用模板：改动、验证方式、eval 影响。
3. 合并前门禁：`ci.yml` 全绿（lint+typecheck+test+build）+ 触碰 agent 代码则 `eval.yml` 全绿。
4. squash merge，`Fixes #123` 自动关 issue。发布 = 合 main 即 Vercel 生产。

## 6. 免费额度红线（提前知道会撞哪堵墙）

- Vercel Hobby：cron 每日一次、非商用——学习项目 OK，别挂公司流量。
- Supabase 免费项目 7 天无活动会暂停：每周至少跑一次（cron 冒烟测试顺便保活）。
- Langfuse 50k events/月：triage 频率低，富余。
- Gemini 免费层有 RPM 限制：eval 批量跑时加并发=1 的节流。
- LLM key 全部走 env（`packages/shared` 统一校验），本地 `.env.local`，生产 Vercel env + Actions secrets，永不进 git。

## 7. 开工命令（P0 第一天）

```bash
cd /Users/lihai/code/zcode/ai-eval-monorepo
git init -b main
pnpm init
# 建 workspace
printf 'packages:\n  - "apps/*"\n  - "packages/*"\n' > pnpm-workspace.yaml
mkdir -p apps packages .github/workflows .github/ISSUE_TEMPLATE
# 用 create-turbo 打底（含 turborepo + next + typescript 全套）
pnpm dlx create-turbo@latest --package-manager pnpm  # 或手动 apps/web: pnpm dlx create-next-app
pnpm dlx biome init
# Supabase
pnpm add -D supabase && supabase login && supabase init
# 首个 commit + 远端
git add . && git commit -m "chore: bootstrap monorepo"
gh repo create ai-eval-monorepo --public --source=. --push
# 然后：Vercel import 该仓库；Supabase 建项目；把三个平台的 URL/key 填进 .env.local
```

> 建议：这份 PLAN 本身以 issue #1 的形式贴进仓库（`docs(plan): 0→1 路线图`），从第一个 commit 就开始走自己的流程——这就是 dogfooding 的第一课。
