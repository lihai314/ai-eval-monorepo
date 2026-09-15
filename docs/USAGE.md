# eval-hub 使用说明

> 平台定位：**AI/agent 评测平台**——管理数据集、发起评测、查看逐条判分；
> 附带 issue 自动分诊（dogfooding 的入口，也是评测数据的来源）。
> 架构与决策见 [PLAN.md](../PLAN.md)，交付链路细节见 [PIPELINE.md](PIPELINE.md)。

## 0. 一页架构

```
浏览器 ──▶ Vercel (Next.js)          页面 + BFF/API（登录门禁）
                │ SQL（PG_DSN）
                ▼
        Supabase  eval-hub            Auth · PostgreSQL(5表) · pgmq 队列 eval_tasks
                │ pgmq.send（BFF 扇出）
                ▼   ▲ 拉取：GHA cron /drain（每30min）+ 手动
        Render  eval-worker (Python)   drain 队列 → httpx 调 SUT → 打分 → 写结果
                │ HTTP
                ▼
        SUT = 被测系统（当前：本仓库 production 的 /api/triage）
```

所有变更的唯一入口是 **GitHub**：代码走 PR→五门禁→merge；schema 走 migrations 自动推送；
worker 服务由 `render.yaml` 声明；看门狗每日证明"线上 == 仓库"。

## 1. 入口速查

| 什么 | 地址 |
|---|---|
| 评测控制台（生产） | https://ai-eval-production-lihai314.vercel.app |
| 控制台（staging） | https://ai-eval-staging-lihai314.vercel.app |
| worker 健康/版本 | https://eval-worker.onrender.com/healthz |
| 身份接口 | `GET /api/me`（未登录 401） |
| GitHub 仓库 | lihai314/ai-eval-monorepo |

## 2. 日常使用

### 2.1 登录
控制台和写接口需要登录（Supabase Auth）。**一次性配置**（见 §6），配好后：
- 邮箱 magic link：输入邮箱 → 收信 → 点链接进控制台
- GitHub OAuth：一键授权（需先在 GitHub 建 OAuth App，见 §6）

### 2.2 跑一次评测
1. 打开控制台 → 选数据集 → **▶ Run eval**
2. 页面跳转 `/runs/<id>`，每条样本一行：`pending → pass/fail`（worker 被心跳唤醒后自动刷新，最长等 30 分钟；想立刻跑见 2.4）
3. 点开某行看 output/scores 明细（exact_match 是子集断言：expected 只写要断言的字段）

API 等价：
```bash
curl -b cookiejar -X POST $P/api/eval-runs -H 'content-type: application/json' \
  -d '{"datasetName":"e2e-smoke"}'          # → {runId, enqueued:N}
curl $P/api/eval-runs/<runId>               # 进度 + 逐条结果
```

### 2.3 issue 自动分诊（评测数据来源）
给仓库开 issue（bug/feature 模板均可）→ 约 1 分钟内线上 agent 回帖：
category/severity/摘要 + 自动打 label（只打仓库词表里存在的 label）。
**不同意就改 label**——纠正记录将来回流成评测样本（P5）。

### 2.4 立即触发 drain（不等 30 分钟心跳）
```bash
gh workflow run "Drift Watchdog"        # 不是这个——看门狗只检查不排空
gh workflow run "Drain Eval Queue"      # ✅ 唤醒 worker 并排空队列
```

## 3. 开发流程（万物皆代码）

```
issue（含验收标准）→ 分支 feat|fix/<名>-<issue号> → PR（模板填验证/回滚）
  → 五门禁：Lint&Typecheck ∥ Unit ∥ API(web) ∥ Worker(py) → Build
  → squash merge 到受保护的 main
  → 自动对账：staging 部署+smoke（版本断言）│ db-migrate（schema）│ Render 重建
  → 需要上生产：gh workflow run "Release Production"（Release 卡点，人工）
  → 部署后 smoke → 证据回写 issue → close
```

本地：
```bash
pnpm install && cp .env.example .env.local
pnpm dev          # 控制台 http://localhost:3000（PG_DSN 指向 Supabase 才可用数据面）
pnpm test         # TS 单测 + API 测试
pnpm lint && pnpm build
cd workers/eval && uv run --extra test pytest   # Python worker 测试
```

## 4. 变更剧本（改 X 该动哪里）

| 想改 | 动哪里 | 生效方式 |
|---|---|---|
| 表结构/策略 | `supabase/migrations/00NN_*.sql` 新文件 | merge 即自动 `db push`；**禁止 dashboard 手改**（看门狗会报漂移） |
| 队列消息格式 | `packages/db/src/task-message.ts` **和** `workers/eval/app/protocols.py` 同一 PR | 两侧测试同时改，CI 强制 |
| worker 逻辑 | `workers/eval/**`（pytest 是第五门禁） | merge 后 Render 自动重建（build 时烘焙 commit） |
| 前端/BFF | `apps/web` + `packages/*` | merge→staging→smoke→点 Release |
| 评测判分语义 | `packages/db`（TS 断言）/ `workers/eval/app/adapters`（Python judge） | 同上 |
| 密钥 | 平台 secret store（Vercel/Render/GitHub Secrets） | 仓库里只出现**名字**（render.yaml `sync:false`、workflow `${{ secrets.X }}`） |

## 5. 看门狗（drift-check.yml，每日 07:20 UTC）

断言并写进运行摘要：production == 最后一次成功 Release；staging == main；
worker == 最后一次触碰 `workers/` 的提交；migrations 本地远端零差异。
失配 → 自动开 `drift` label issue（去重、持续漂移追加评论）；恢复 → 自动评论并关闭。
手动跑：`gh workflow run "Drift Watchdog"`。它同时是 Supabase 保活（防 7 天休眠）。

## 6. 一次性配置（人的部分）

1. **Supabase Auth 站点配置**（magic link 回跳必需）：
   ```bash
   # 去 dashboard → Account → Tokens 建一个，然后：
   SUPABASE_ACCESS_TOKEN=*** ./scripts/setup-supabase-auth.sh
   ```
   （或手动：Dashboard → Authentication → URL Configuration：
   Site URL=`https://ai-eval-production-lihai314.vercel.app`，
   Redirect URLs 追加 staging 与 `http://localhost:3000`）
2. **GitHub OAuth（可选）**：GitHub → Settings → Developer settings → OAuth Apps →
   New：callback=`https://snxliarypkeuzvecjnfy.supabase.co/auth/v1/callback`；
   然后 `GH_OAUTH_CLIENT_ID=... GH_OAUTH_SECRET=*** .../setup-supabase-auth.sh`，
   并给两个 Vercel 项目设 `NEXT_PUBLIC_GITHUB_OAUTH=1`。
3. **LLM key（P1，评测真实化的前提）**：给两个 Vercel 项目加
   `OPENAI_API_KEY`（+可选 `OPENAI_BASE_URL`/`TRIAGE_MODEL`，Gemini 免费层兼容端点即可）；
   `/api/health` 的 `llmMode` 会从 `mock` 变 `live`。worker 侧 DeepEval judge 同理
   （`pip install -e '.[judge]'` + `DEEPEVAL_ENABLED=1` + key）。

## 7. 排障速查

| 症状 | 先看 | 常见原因 |
|---|---|---|
| 控制台显示 DB unavailable | Vercel 项目 env `PG_DSN` | 未配/被改；`scripts/setup-vercel.sh` |
| run 一直 pending | `gh run list --workflow "Drain Eval Queue"`；worker `/healthz` | 心跳没跑/worker 冷启动（free 档 15min 休眠，正常） |
| drain 502 | 502 的 detail 自带原因 | 之前真实案例：密码串复制进 `%`、jsonb 双重编码 |
| 看门狗开 issue | 该 run 的 summary 表 | 真旁路部署/dashboard 改库；或 Release 没点（prod 落后是**预期**，基线已处理） |
| CI 红 | `gh pr checks <n>` | 五门禁逐 job 看日志 |
| staging 部署失败 | Actions → Deploy Staging | `VERCEL_TOKEN`（staging 项目级 vcp_）过期/被轮换 |

## 8. 当前边界（诚实清单）

- agent 是 **mock**（未配 LLM key）：链路真实、智能占位
- 数据集/纠正回流 UI 未做（P3/P5）：现在用 SQL/pgmq.send 或 e2e-smoke 演示集
- Playwright e2e、Sentry、OTel 在 PLAN 的 P6/P7，尚未接线
- free 档限制：worker 冷启动 ~1min；Supabase 7 天不动休眠（看门狗保活）；LLM 并发=1
