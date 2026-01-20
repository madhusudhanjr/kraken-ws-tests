# Kraken WebSocket V2 Regression Suite

This repository contains a robust, production-grade automated regression suite for the **Kraken WebSocket V2 API**. It validates that the V2 migration preserves data integrity, financial correctness, and real-time delivery guarantees while remaining resilient to network variability and API edge cases.

---

## 1. Test Strategy Summary

The suite emphasizes **contract validation**, **financial correctness**, and **real-time behavior** using event-driven assertions instead of fixed delays.

**Key validation areas:**
- **Handshake & Liveness:** Validates system status messages and heartbeat delivery.
- **Schema Stability:** Ensures critical fields (`bid`, `ask`, `symbol`, `timestamp`) remain consistent across updates.
- **Financial Integrity:** Confirms non-crossed books, valid spreads, and precision limits.
- **Subscription Management:** Verifies subscribe, unsubscribe, duplicate subscription handling, and idle connection behavior.
- **Multi-Market Streaming:** Ensures a single connection can stream multiple markets concurrently and reliably.

---

## 2. Requirements

- **Node.js:** v18.0.0 or higher  
- **Docker:** Optional, for containerized execution  
- **Kraken API Access:** No API keys required for public market data channels  

---

## 3. Tools & Technologies

- **Playwright (Test Runner):** Stable async execution, built-in tracing, retries, and CI-friendly reporting.
- **TypeScript:** Compile-time safety for complex financial schemas.
- **WebSocket (`ws`):** Lightweight and reliable WebSocket client.
- **Docker (Optional):** Environment consistency across local and CI executions.

---

## 4. Dependencies

Core libraries used:
- `@playwright/test`
- `ws`
- `typescript`

---

## 5. Project Structure

```text
kraken-ws-tests/
├── tests/                     # Playwright test specifications
│   └── kraken-v2.spec.ts      # Kraken V2 WebSocket regression tests
├── utils/
│   └── ws-helper.ts           # KrakenClient WebSocket wrapper and helpers
├── constants/
│   └── kraken.constants.ts    # API endpoints, channels, symbols, and config
├── playwright.config.ts       # Playwright configuration
├── bug-report.md              # Known defects and execution issues
├── testcase.md                # Test case documentation
├── NOTES.txt                  # Design decisions and technical rationale
├── package.json               # Project dependencies and scripts
└── README.md                  # Project documentation
```

## 6. Execution

#### Local Execution
`npm install`
`npx playwright test`

#### Docker Execution
`docker build -t kraken-ws-test .`
`docker run --rm kraken-ws-test`

## 7. Reporting & Debugging

HTML Report: Generated in playwright-report/.

Trace Viewer: Detailed traces for failed tests.

Bug Reports: Known issues documented in bugreport.md.