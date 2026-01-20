# Kraken WebSocket V2 Regression Suite

This repository contains a high-performance automated regression suite designed for the **Kraken WebSocket V2 API**. It ensures that the migration from V1 to V2 maintains data integrity, follows strict financial logic, and meets service-level agreements (SLAs).

## 1. Test Strategy Summary
The suite focuses on **contract testing** and **behavioral validation**. Given the asynchronous nature of WebSockets, we utilize a **predicate-based waiting mechanism** rather than static delays to ensure speed and reliability.
* **Liveness:** Continuous monitoring of the **10s heartbeat SLA**.
* **Schema Validation:** Ensuring the new **keyed JSON structure** is consistent across all symbols.
* **Financial Integrity:** Validating that **spreads are not crossed** and price precision adheres to exchange constants.
* **Robustness:** Testing the gateway's ability to handle **duplicate subscriptions** and invalid inputs gracefully.

## 2. Requirements
* **Node.js:** v18.0.0 or higher.
* **Docker:** (Optional) For containerized execution.
* **Kraken API Access:** No API keys are required for public market data channels.

## 3. Tools & Technologies
* **Playwright (Test Runner):** Chosen for its superior asynchronous handling, built-in trace viewer, and powerful assertion library.
* **TypeScript:** Selected over Python to provide **strict typing** for complex JSON schemas, reducing runtime "undefined" errors.
* **Docker:** Ensures a consistent environment, eliminating "it works on my machine" issues related to network stack configurations.

## 4. Dependencies
The project relies on the following core libraries:
* `@playwright/test`: Core test framework.
* `ws`: Robust WebSocket client for Node.js.
* `typescript`: Static type checking.
* `dotenv`: Environment variable management.

## 5. Execution

### **Local Execution**
1.  **Install dependencies:** `npm install`
2.  **Run all tests:** `npx playwright test`

### **Docker Execution**
1.  **Build image:** `docker build -t kraken-ws-test .`
2.  **Run suite:** `docker run --rm kraken-ws-test`

## 6. Reporting
The suite generates multiple report formats:
* **HTML Report:** Interactive dashboard in `playwright-report/`.
* **Trace Viewer:** Deep-dive recordings of WebSocket messages for failed tests.
* **Bug Reports:** Failed tests are mapped to IDs in `Bugreport.md`.