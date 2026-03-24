# WISE — Competitive Positioning & Alternative Runners

Optional reading. The agent does not need this to build a scraping project. Read this when evaluating WISE against other frameworks or choosing a non-default runner backend.

## vs Crawlee

[Crawlee](https://crawlee.dev/) is a TypeScript/Node.js web scraping framework with Playwright/Puppeteer/Cheerio backends, request queues, auto-scaling, and proxy rotation. It's a production-grade crawling library.

| Dimension | Crawlee | WISE |
|---|---|---|
| **Nature** | Library you import and code against | Skill that teaches an AI agent to build a scraper |
| **Extraction** | You write JS/TS handlers per route | Declarative YAML profiles interpreted by a runner |
| **Browser** | Built-in Playwright/Puppeteer launcher | `agent-browser` — shared with agent exploration |
| **Scaling** | Built-in concurrency, proxy, queue | Single-session; agent adds concurrency if needed |
| **AI agent fit** | Agent must learn the Crawlee API | Agent reads profile schema, assembles fragments |
| **When better** | High-volume production crawls, proxy rotation, Apify platform integration | Agent-driven repeatable scraping projects, declarative profiles, explore→exploit workflow |

Crawlee is a strong alternative runner backend — see **Alternative Runner Backends** below.

## vs Scrapy + scrapy-playwright

[Scrapy](https://scrapy.org/) is Python's dominant scraping framework. [scrapy-playwright](https://github.com/scrapy-plugins/scrapy-playwright) adds Playwright rendering to Scrapy spiders, giving JS-rendered page support.

| Dimension | Scrapy + scrapy-playwright | WISE |
|---|---|---|
| **Language** | Python | TypeScript (runner), YAML (profiles) |
| **Extraction** | Python spider classes, CSS/XPath selectors | Declarative YAML profiles with DOM eval |
| **JS rendering** | Via scrapy-playwright download handler | Via `agent-browser` CLI |
| **Middleware** | Rich ecosystem (proxies, throttle, pipelines) | Hook system (5 extension points) |
| **AI agent fit** | Agent writes Python spider code | Agent assembles YAML profile fragments |
| **When better** | Large-scale Python pipelines, existing Scrapy infrastructure, deep middleware ecosystem | Agent-driven projects, declarative-first extraction, TypeScript ecosystem |

Scrapy + scrapy-playwright is a strong alternative runner backend — see below.

## When to use what

- **Crawlee**: you want a TypeScript crawling library with production infra (queues, proxies, auto-scaling)
- **Scrapy + scrapy-playwright**: you want Python's most mature scraping framework with JS rendering
- **WISE**: you want an AI coding agent to build a repeatable scraping project using declarative profiles and an explore→exploit workflow

All three can coexist — WISE profiles can target Crawlee or Scrapy backends instead of the shipped `agent-browser` runner.

## Alternative Runner Backends

The shipped runner uses `agent-browser` as the browser layer, but the profile schema is runner-agnostic. An agent can implement the same YAML profile interpretation using a different backend:

### Crawlee runner

A Crawlee-based runner would:
1. Read the same YAML profile
2. Use `PlaywrightCrawler` instead of `agent-browser` for page loading
3. Map `selectors[].interaction` to Playwright page actions
4. Map `selectors[].extract` to `page.evaluate()` calls
5. Use Crawlee's `RequestQueue` for pagination and multi-resource discovery
6. Gain: auto-retry, proxy rotation, session management, Apify deployment

```
references/runner-crawlee/     # Crawlee-based runner (same profile schema)
  src/
    crawler.ts                 # PlaywrightCrawler setup
    profile-adapter.ts         # YAML profile → Crawlee router/handler mapping
    extract.ts                 # DOM eval via page.evaluate()
    run.ts                     # CLI entry point
```

### Scrapy + scrapy-playwright runner

A Scrapy-based runner would:
1. Read the same YAML profile
2. Generate a Scrapy spider dynamically from the profile
3. Use `scrapy-playwright` for JS rendering
4. Map `selectors[].extract` to `page.evaluate()` in Playwright pages
5. Use Scrapy's item pipelines for JSONL output
6. Gain: Scrapy middleware ecosystem, distributed crawling (Scrapyd/Zyte), Python data pipeline integration

```
references/runner-scrapy/      # Scrapy-based runner (same profile schema)
  spiders/
    profile_spider.py          # Dynamic spider generated from YAML profile
  pipelines.py                 # JSONL output pipeline
  settings.py                  # scrapy-playwright config
  run.py                       # CLI entry point
```

### Profile compatibility

The key insight: **the YAML profile is the contract, not the runner**. All runners interpret the same schema fields (`artifacts`, `resources`, `selectors`, `interaction`, `extract`, `pagination`, `matrix`). The agent picks the runner backend based on the project's requirements:

| Need | Runner |
|---|---|
| Quick exploration + exploit | `agent-browser` runner (shipped) |
| Production volume + proxies | Crawlee runner |
| Python ecosystem + pipelines | Scrapy runner |
| Custom / bespoke | Agent writes its own interpreter |
