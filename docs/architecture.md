# 架构设计

## 总览

系统由「前端管理后台」与「后端服务」组成，后端集成抓取调度、规则计算与数据存储。默认使用 Mock 数据源，切换到爬虫模式可进行真实抓取。

```
Frontend (React/Vite)
        │
        ▼
Backend (FastAPI)
        │
        ├─ TaskRunner / Rule Engine
        ├─ BiliClient (Mock | Crawler)
        ├─ Celery Worker + Beat
        └─ SQLite (SQLAlchemy)
```

## 组件说明

### 前端（frontend）
- React + Vite
- 页面：任务、模板、运行、视频库、告警、设置、指标看板
- 通过 `VITE_API_BASE_URL` 调用后端 `/api`

### 后端（backend）
- FastAPI + SQLAlchemy
- SQLite 默认数据库（`bili_admin.db`）
- 关键模块：
  - `TaskRunner`：执行任务、写入视频/运行记录
  - `rule_engine`：爆款/低粉爆款规则计算
  - `bili_client`：Mock/爬虫数据源
  - `settings_service`：系统配置

### 异步与调度
- Celery Worker 执行任务运行
- Celery Beat 定时调用 `dispatch_due_tasks`
- 任务日程：目前仅支持 `daily + time`
- Redis 用于分布式锁，避免重复触发

## 数据流

1. 用户创建任务 → 配置关键词、规则、抓取范围
2. 任务执行（手动或调度）→ `TaskRunner`
3. 调用 `BiliClient` 拉取数据 → 计算规则 → 写入 `Video/TaskVideo/Run`
4. 运行异常累积 → 达到阈值生成 `Alert`
5. 前端拉取指标、视频、告警进行展示与操作

## 核心数据模型

- `tasks`：任务配置与状态
- `runs`：任务运行记录
- `videos`：视频指标与标签
- `task_videos`：任务与视频关联
- `subtitles`：字幕提取状态与内容
- `alerts`：任务异常告警
- `task_templates`：任务模板
- `system_settings`：系统运行配置

## 规则系统

- `basic_hot`：基于播放/收藏/投币/评论阈值，支持 `any/all` 模式
- `low_fan_hot`：结合粉丝数上限 + 播放量 + 指标率 + 收藏/粉丝比

## 配置与环境

- `.env` 控制运行配置（数据库、Redis、CORS、Bili Client）
- `BILI_CLIENT`：`mock`（默认）/ `crawler`
- `BILI_COOKIES` 与 `BILI_USER_AGENT` 用于提升真实抓取成功率

## 可扩展点

- 替换 `CrawlerBiliClient` 为更稳定的数据采集策略
- 规则引擎可扩展更多指标与标签
- 增加鉴权、租户隔离与权限体系
