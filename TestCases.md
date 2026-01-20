# Kraken WebSocket V2 API Test Cases

This document details the functional and non-functional test cases for the Kraken V2 WebSocket API migration. These cases focus on validating the gateway, market data integrity, and system lifecycle robustness.

| ID | Channel | Scenario | Business Rationale | Success Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | status | Handshake | Ensures gateway is reachable. | 101 handshake completes < 2s. |
| **TC-02** | heartbeat | Liveness | Ensures connection stays active. | Receive heartbeat every 1s (idle). |
| **TC-03** | ticker | Spread Logic | Prevents negative spreads. | Ask price ≥ Bid price. |
| **TC-04** | ohlc | Range Check | Protects charting from broken candles. | High ≥ Low, Open, and Close. |
| **TC-05** | trade | Stream Liveness | Validates real-time execution flow. | Trade received within 10s (BTC/USD). |
| **TC-06** | book | Order Crossing | Detects matching engine failure. | Best Bid < Best Ask. |
| **TC-07** | ticker | Continuity | Chronological delivery check. | Current TS > Previous TS. |
| **TC-08** | System | Invalid Symbol | Rejects unsupported assets. | Error on invalid pair (e.g., ZRX/USD). |
| **TC-09** | System | Duplicates | Validates idempotency. | Second sub returns "Duplicate" error. |
| **TC-10** | System | Unsubscribe | Ensures cleanup. | Zero data after unsubscribe ACK. |
| **TC-11** | All | Monotonicity | Prevents race conditions. | Message N+1 TS ≥ Message N TS. |
| **TC-12** | ticker | Precision | Prevents UI breaks. | Prices match pair decimal constants. |
| **TC-13** | System | Idempotency | Prevents duplicate streams. | Duplicate sub is gracefully ignored. |
| **TC-14** | System | Cleanup | Server stop check. | No data arrives 5s after unsubscribe. |
| **TC-15** | System | Normalization | Strict type enforcement. | Lowercase subs return error or normalize. |
| **TC-16** | Any | Schema | Downstream bot protection. | Valid JSON with all required V2 keys. |


---

## 1. Connectivity & Liveness
| ID | Channel | Scenario | Business / Product Rationale | Engineering Verification (Success Criteria) |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | status | Handshake & Auth | Ensures the gateway is reachable and the system is "online." | System status is online. HTTP 101 handshake completes within <2s. |
| **TC-02** | heartbeat | Liveness Check | Ensures the connection stays active during low market activity. | Receive a heartbeat event every 1s when no other data is flowing. |

## 2. Market Data Logic
| ID | Channel | Scenario | Business / Product Rationale | Engineering Verification (Success Criteria) |
| :--- | :--- | :--- | :--- | :--- |
| **TC-03** | ticker | Ticker Spread Logic | Prevents "Bad Data" bugs like negative spreads (Bid > Ask). | Ask price must be ≥ bid price in the ticker data object. |
| **TC-04** | ohlc | OHLC Range Check | Protects charting tools from impossible "broken candles" (e.g., Low > High). | high ≥ low, high ≥ open, and high ≥ close. |
| **TC-05** | trade | Trade Stream Liveness | Validates that real-time execution data for high-volume pairs is flowing. | At least one trade packet received within a 10s window for BTC/USD. |

## 3. Data Integrity & Sequence
| ID | Channel | Scenario | Business / Product Rationale | Engineering Verification (Success Criteria) |
| :--- | :--- | :--- | :--- | :--- |
| **TC-06** | book | Order Book Crossing | A "crossed" book suggests a core matching engine failure. | best_bid < best_ask in both snapshot and update messages. |
| **TC-07** | ticker | Timestamp Continuity | Verifies updates are delivered in chronological order. | Current message timestamp > previous message timestamp. |
| **TC-11** | All | Strict Monotonicity | Refactors often introduce race conditions where newer messages arrive first. | Timestamp of message N+1 must be ≥ Timestamp of message N. |
| **TC-12** | ticker | Decimal Precision | Legacy UIs break if price precision changes (e.g., from 2 to 8 decimals). | Price fields (bid/ask) must match the known pair decimal constants. |

## 4. Lifecycle & Robustness
| ID | Channel | Scenario | Business / Product Rationale | Engineering Verification (Success Criteria) |
| :--- | :--- | :--- | :--- | :--- |
| **TC-08** | System | Invalid Symbol Handling | Ensures the API rejects non-existent or unsupported asset pairs. | Receive an error message when subscribing to an invalid pair (e.g., `ZRX/USD`). |
| **TC-09** | System | Duplicate Subscription | Validates feed idempotency and prevents resource leaks. | Sending the same subscribe request twice returns a "Duplicate" error. |
| **TC-10** | System | Unsubscribe Confirmation | Ensures the server stops the stream once a client is finished. | Receive a success confirmation for `unsubscribe` and zero subsequent data. |
| **TC-13** | System | Sub Idempotency | Prevents system crashes or "duplicate streams" if client sends request twice. | Second subscribe request results in an error or is gracefully ignored. |
| **TC-14** | System | Unsubscribe Cleanup | Ensures server stops streaming for data no longer requested. | After unsubscribe ACK, zero data packets arrive for that symbol for 5s. |
| **TC-15** | System | Normalization Check | Legacy systems have loose string handling; refactors enforce strict types. | Subscribing to btc/usd (lowercase) is either auto-normalized or returns a clean error. |
| **TC-16** | Any | Schema Validation | Ensures refactors don't drop keys that downstream bots expect. | Every message is valid JSON and contains all "Required" keys per v2 spec. |