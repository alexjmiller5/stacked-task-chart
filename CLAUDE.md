# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stacked Task Chart is a single-page web application that visualizes Notion task data as a stacked area chart over time. Python/Flask backend fetches and caches Notion API data; vanilla JS frontend renders interactive charts with ECharts.

## Running the App

```bash
./startup.sh
```

Starts both servers using `uv run` for Python dependency management:
- **Backend** (Flask): port 5000
- **Frontend** (Python http.server): port 8000

Requirements: Python 3.8+, `uv`, 1Password CLI (`op`) for secrets retrieval.

There is no build step, no bundler, no test suite, no linter configuration.

## Architecture

### Backend (`api/server.py`)

Single-file Flask app with two endpoints:
- `GET /api/cached-data` — returns `notion-cache.json` contents (instant)
- `GET /api/refresh-data` — fetches all pages from Notion with pagination, updates cache, returns data

Notion API key is retrieved at startup via 1Password CLI (`op`). Database ID is hardcoded. Cache file is `notion-cache.json` in project root.

### Frontend (`script.js`)

All logic lives in a single `DOMContentLoaded` callback. No modules, no framework, no TypeScript.

**Data flow:**
1. Fetch cached data from `/api/cached-data`, then refresh from `/api/refresh-data` in parallel
2. Parse Notion page properties into task objects (id, created, completed, dueDate, status, tags, history)
3. Build an events Map keyed by date string with created/completed/stateChange arrays
4. Calculate running task counts per day by iterating each day and tracking active tasks
5. Render stacked area chart via ECharts

**State object** drives all UI: `groupBy` (tag|dueDate), `dateRange`, `selectedTags`, `selectedDueDateStatuses`, `includeIncomplete`, `includeLegacyTasks`.

**History ledger:** Tasks store tag/date change history in a Notion rich text field ("Tag & Date History") with format `[YYYY-MM-DD HH:MM] --- Tags: [tag1, tag2], Due Date: YYYY-MM-DD`. This enables historical tag tracking — the chart can show what tags a task had on any given day.

**Task filtering:** Tasks with status "Cancelled" or tag "useless" are excluded. Legacy filter excludes tasks created before 2025-01-10. The calculation algorithm is O(days × tasks).

### Frontend UI (`index.html`, `styles.css`)

Tailwind CSS via CDN for layout and styling. Minimal custom CSS for loader animation and chart container. All UI controls (group-by switcher, date range, tag filter dropdown, status filter, toggles) are in `index.html` with Tailwind utility classes.

## Code Conventions

- Frontend: vanilla JS, all in one file, Tailwind utility classes inline
- Backend: standard Flask patterns, `jsonify` responses, CORS enabled
- CDN dependencies: Tailwind CSS, ECharts v5.4.3, Day.js v1.11.10
- Commit messages: lowercase, informal style
