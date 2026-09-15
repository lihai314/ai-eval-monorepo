# PLAN v2 — eval-hub：Agent 评测平台（产品定义于 2026-09-14 定稿）

> v1（学习导向的 0→1 路线图）已完成使命，存于 git 历史（b9ab545..e02060a）。
> 本版是产品计划：**做一个 AI/agent 评测平台，带可视化操作页面**。
> 已经跑通的基建（pipeline、CI 门禁、双 Vercel 环境、auto-triage 循环）全部保留为地基。

---

## 1. 产品定义（一句话）

**eval-hub**：管理"被测 agent → 数据集 → 评测运行 → 分数/趋势/逐条钻取"的可视化操作台，
第一个被测 agent 是本仓库的 issue-pilot triage agent（dogfooding），
且生产的真实 triage 流量会回流为评测数据——**平台既是仪表盘，也是数据飞轮本身**。

成功的硬标准：新用户 10 分钟内完成 登录 → 建数据集 → 跑一次 eval → 看懂报告。

## 2. 架构映射（目标组件 → 在评测平台中的具体职责）

| 组件 | 职责 | 免费额度依据 |
|---|---|---|
| **Next.js (apps/web)** | 控制台 UI + `/api/*` 业务后端（runs 编排、auth 会话、数据集 CRUD） | Vercel Hobby（双项目沿用） |
| **Supabase Auth** | GitHub OAuth 登录（多租户预留） | 50k MAU 免费 |
| **Supabase PostgreSQL** | 实体表（§3）+ RLS；扩展 `pgmq` 承载队列 | 500MB、激活扩展即用；**兜底**：若 Queues 不可用，普通表 + worker 轮询，接口不变 |
| **Supabase Storage** | eval 产物：原始 LLM 输出归档、CSV/JSON 报告导出 | 1GB 免费 |
| **Supabase Edge Functions** | ① GitHub webhook 接收器（issue→enqueue）② **eval 队列消费者**（item 级 worker，重试/节流） | 50 万调用/月 |
| **GitHub Actions** | 已有 pipeline + 新增：`e2e.yml`（Playwright）、`eval-gate.yml`（prompt 变更触发） | 公开仓库免费 |
| **Vitest** | 现有 14 测 + eval 逻辑测 | — |
| **Playwright** | 关键用户流：登录→建数据集→跑 eval→看报告→纠正回流 | — |
| **Agent Evaluation** | `packages/eval`：**既是产品内核也是 CI 门禁**——dataset schema / graders / runner 一份代码两用 | — |
| **Sentry** | 错误 + Web Vitals；兼作 OTLP trace 接收端（一套 DSN，不维护两套 trace 系统） | 5k errors/月 |
| **OpenTelemetry** | 跨边界追踪：API → 队列 → Edge worker → LLM 调用（span 携带 run_id/item_id，报告页可跳转） | Sentry OTLP |
| **Supabase Logs** | DB + Edge Function 日志排障（`supabase logs`） | 随项目 |

**后端分层铁律**（防两套后端抢活）：同步业务逻辑、DB 事务、需要 Node 生态 → Next.js server routes；
webhook 入口、队列消费者、边缘低延迟 → Edge Functions。Edge Function 是异步侧，不是主战场。

## 3. 数据模型（v0 schema）

```sql
agents        (id, name, version, prompt_hash, model_config jsonb)
datasets      (id, name, version, source)                  -- version 递增而非原地改
dataset_items (id, dataset_id, input jsonb, expected jsonb,
               provenance text)                            -- manual | production | corrected
eval_runs     (id, agent_id, dataset_id, status, totals jsonb,
               started_at, finished_at)                    -- queued|running|done|failed
eval_results  (id, run_id, item_id, output jsonb, scores jsonb,
               verdict, error, trace_id)                   -- 逐条：pass/fail + 0–5 分
```

关键决定：**dataset 版本化 + item 携带 provenance**——数据飞轮的地基；eval_results.trace_id 把评测条目挂到 OTel trace。

## 4. UI 页面（操作台地图）

```
/                       dashboard：分数趋势曲线、最近 runs、待纠正队列
/datasets  /datasets/:id            items 浏览 + 纠正审核
/agents    /agents/:id              版本历史 + prompt 快照
/runs      /runs/new  /runs/:id     触发评测、聚合分 + 逐条表格 + 单条钻取(input/output/expected/score/reason)
/runs/:a/compare/:b                 版本对比（diff 视图）
/live                               生产 triage 实时流（= eval 样本的入口）
/settings                           keys、告警阈值
```

## 5. 数据飞轮（产品的灵魂，全链路）

```
production 上 agent 处理真实 issue ──▶ /live 队列 ──▶ 人工纠正 label/verdict
      ▲                                                    │
      │                                        corrected 样本自动进入新 dataset 版本
      │                                                    ▼
release 通过 ◀── eval-gate 绿 ◀── eval run（队列异步、并发=1 节流）
      │                                  ▲
      └── 新 production 样本 ─────────────┘（每次上线都在扩大下一轮数据集）
```

## 6. 实施阶段（每步走既有 pipeline，CI→staging→smoke→release→prod 才算完成）

- **P1 · 真实 LLM**：给 production/staging 配 `OPENAI_API_KEY/BASE_URL/TRIAGE_MODEL`（推荐 Gemini 免费层，OpenAI 兼容端点），`llmMode` 变 live。**当前一切评测的前提。**
- **P2 · Supabase 基座**：`supabase init` + 首个 migration（§3 schema）+ GitHub OAuth 登录 + 控制台外壳（布局/导航/会话）。
- **P3 · eval 核心**：`packages/eval`（jsonl dataset 格式、programmatic + model-graded graders、runner CLI）；runs 写库；`/runs` 手动触发 + 报告页。
- **P4 · 队列 + worker**：激活 `pgmq`（或表轮询兜底）；eval-run fan-out 进队列，Edge Function worker 消费；`/live` 上线。
- **P5 · 纠正回流**：`/live` 上的人工纠正自动生成 `provenance=corrected` 样本与新 dataset 版本。
- **P6 · 观测 + e2e 收口**：Sentry 接线、OTel NodeSDK→OTLP（span 挂 run_id）、Playwright 关键流、`eval-gate.yml` 成为 PR 门禁。
- **P7 · 打磨**：对比视图、Storage 导出、dashboard 趋势、eval 历史入 Supabase 后的 nightly 回归。

顺序有依赖：P1 没做完，P3 的 model-graded 就是空转；P4 没做完，P5 的回流只能同步跑。

## 7. 免费额度红线（v2 更新）

- LLM：Gemini 免费层有 RPM 上限 → **eval 并发=1 + 指数退避**，这是架构约束不是优化项
- Supabase：7 天不活动暂停（每日 cron 冒烟保活，兼作 uptime 监控）；Queues 若免费项目无法激活 → 表轮询兜底
- Vercel Hobby cron 每日一次；Sentry 5k errors/月；Storage 1GB
- eval 数据集控制在 ≤500 items 起步，产物归档进 Storage 不占 DB

## 8. 既有资产继承清单

✅ 交付链路（issue→PR→CI→staging→smoke→release→production）→ 成为平台的 CI/CD
✅ auto-triage 循环（#11–13 已验证）→ 成为 `/live` 的流量入口与 eval 首个被测 agent
✅ packages/shared zod 契约 + packages/agent（LlmClient 接缝/白名单/幂等）→ eval 的评分对象
✅ 15 个 Vitest + PR/issue 模板 + 标签词表 → 随 P2–P6 扩张
