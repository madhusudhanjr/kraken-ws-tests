# Kraken WebSocket V2 Regression Analysis
#### Issues observed during test execution

| Bug ID | TC ID | Channel | Summary | Expected Behavior | Actual Behavior | Severity |
|--------|-------------|---------|---------|-------------------|-----------------|----------|
| BUG-02 | TC-13 | ticker | Multi-market subscription missing expected symbol stream | Updates should be received for all subscribed symbols | Only ETH/USD updates received; BTC/USD missing | High |
| BUG-03 | TC-16 | none | Idle connection test fails due to unexpected message | No subscription-related messages should be received during idle window | Silence check fails due to unexpected message reception | Medium |
| BUG-04 | TC-09 | ticker | Unsubscribe does not fully stop message flow | No ticker updates should be received after unsubscribe | Messages continue after unsubscribe | High |
| BUG-05 | TC-10 | ticker | Duplicate subscription handling unclear | Second subscription should be rejected or handled gracefully | API response behavior inconsistent or undocumented | Medium |
| BUG-06 | TC-12 | ticker | Subscription acknowledgment missing required contract keys | Response should include all mandatory keys | One or more required keys missing in response | High |
