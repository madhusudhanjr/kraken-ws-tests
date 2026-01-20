# Kraken WebSocket V2 Regression Analysis

This report outlines the critical regressions and inconsistencies identified during the transition from the Kraken WebSocket V1 to the V2 API. The following bugs represent significant deviations from documented SLAs and legacy (V1) performance standards.

---

## 1. Executive Summary
The migration to V2 has introduced several high-severity issues, most notably **gateway instability (503 errors)** and **liveness violations (heartbeat suppression)**. Additionally, the shift to a keyed JSON schema has resulted in inconsistent object keys in the Order Book channel, which can lead to runtime crashes for strictly typed client applications.

---

## 2. Bug Table

| Bug ID | Severity | Category | Observed Behavior (V2 Regression) | SLA / V1 Reference Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **KRA-V2-01** | **High** | **Liveness** | Heartbeats fail to arrive within 30s. Connection goes silent in idle state. | **V1:** 1 heartbeat/sec guaranteed in absence of data. |
| **KRA-V2-02** | **Critical** | **Availability** | Random **503 Service Unavailable** errors during the WebSocket upgrade (handshake). | **V1:** High availability; 503s are extremely rare during connection. |
| **KRA-V2-03** | **High** | **Schema** | `book` snapshot is inconsistent. `bid`/`ask` vs `bids`/`asks` keys and occasional empty `data` objects. | **V1:** Fixed positional arrays (`as`/`bs` keys) for snapshots. |
| **KRA-V2-04** | **Medium** | **Data Integrity** | Timestamp strings return `NaN` in standard Node.js/JS Date parsers. | **V1:** Standardized UNIX timestamps (seconds.microseconds). |
| **KRA-V2-05** | **Low** | **Consistency** | Error strings changed case (e.g., `Already subscribed`). | **V1:** Lowercase convention for error strings. |

---

## 3. Detailed Observations

### **Liveness (KRA-V2-01)**
The V2 Heartbeat mechanism frequently fails to meet the expected 10-second interval. In several test runs, the connection remained open but completely silent for over 30 seconds, exceeding our fail-safe timeout.

### **Gateway Stability (KRA-V2-02)**
The V2 gateway appears significantly more sensitive than V1. Even with low-parallelism testing (single worker), the handshake process intermittently returns a `503 Service Unavailable` status, indicating resource exhaustion or load-balancing misconfigurations.

### **Schema Consistency (KRA-V2-03)**
The order book channel exhibits "key flipping." Automated parsers expecting `bid` or `ask` occasionally fail because the API returns plural `bids` or `asks`, or in some cases, a snapshot containing an empty `data` array despite active market depth.

---