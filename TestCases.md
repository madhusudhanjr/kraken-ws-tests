# Kraken WebSocket V2 API Test Cases

This document details the functional and non-functional test cases for the Kraken V2 WebSocket API migration. These cases focus on validating the gateway, market data integrity, and system lifecycle robustness.

| TC ID | Channel | Description | Success Criteria |
|-------|---------|-------------|------------------|
| TC-01 | status | Verify handshake returns system status | System status message received with system = online |
| TC-02 | heartbeat | Verify heartbeat liveness after subscription | Heartbeat message received within timeout |
| TC-03 | ticker | Verify ticker spread validity | Ask price ≥ bid price in all updates |
| TC-04 | ohlc | Verify OHLC range consistency | High ≥ low, open, and close |
| TC-05 | trade | Verify trade stream continuity | At least two trade updates received within timeout |
| TC-06 | book | Verify order book is not crossed | Best bid < best ask in snapshot |
| TC-07 | ticker | Verify timestamp monotonicity | Timestamps are non-decreasing across updates |
| TC-08 | ticker | Verify decimal precision limits | Price decimals ≤ configured precision |
| TC-09 | ticker | Verify unsubscribe stops data flow | No messages received after unsubscribe |
| TC-10 | ticker | Verify duplicate subscription handling | Second subscription rejected or flagged |
| TC-11 | ticker | Verify lowercase symbol normalization | Valid response or structured error returned |
| TC-12 | ticker | Verify API contract keys presence | Response contains required keys |
| TC-13 | ticker | Verify multi-market subscription | Updates received for all subscribed markets |
| TC-14 | ticker | Verify multi-currency pair streaming | Updates received for all currency pairs |
| TC-15 | ticker | Verify mixed market pair streaming | Updates received for ETH/USD and BTC/GBP |
| TC-16 | none | Verify idle connection behavior | No subscription messages during idle timeout |
