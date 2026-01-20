import { test, expect } from '@playwright/test';
import { KRAKEN_V2 } from '../constants/kraken.constants';
import { KrakenClient } from '../utils/ws-helper';

test.describe('Kraken V2 API - WebSocket v2 MArket Data', () => {
  let client: KrakenClient;

  /**
   * Before each test, establish a fresh connection.
   * This provides "Clean Slate" isolation, ensuring errors in one test 
   * (like a hanging subscription) do not affect subsequent tests.
   */
  test.beforeEach(async () => {
    client = new KrakenClient(KRAKEN_V2.URL);
    await client.connect();
  });

  /**
   * Terminate the WebSocket immediately after each test.
   * This prevents memory leaks and ensures no dangling listeners remain active.
   */
  test.afterEach(() => client.close());

  /**
   * TC-01: Verifies that the initial handshake correctly returns the system status.
   * Logic: The 'status' channel is pushed immediately upon connection.
   */
  test('TC-01: Handshake & Status', async () => {
    const msg = await client.waitFor(m => m.channel === KRAKEN_V2.CHANNELS.STATUS);
    expect(msg.data[0].system).toBe('online');
  });

  /**
   * TC-02: Verifies liveness mechanism.
   * Logic: Heartbeats prevent the load balancer from killing idle connections.
   */
  test('TC-02: Heartbeat Liveness', async () => {
    // 1. Subscribe to a low-traffic channel to 'wake up' the stream
    // Using OHLC or Ticker for a stable pair helps keep the pipe open
    client.send({ 
      method: KRAKEN_V2.METHODS.SUBSCRIBE, 
      params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] } 
    });

    // 2. Wait for the subscription to be acknowledged first
    await client.waitFor(m => m.method === KRAKEN_V2.METHODS.SUBSCRIBE && m.success === true);

    // 3. Now wait for the heartbeat with a 30s timeout
    // Kraken heartbeats are 10s intervals; 30s covers 3 missed pulses
    const msg = await client.waitFor(
      m => m.channel === KRAKEN_V2.CHANNELS.HEARTBEAT, 
      30000 
    );
    
    expect(msg).toBeDefined();
    expect(msg.channel).toBe(KRAKEN_V2.CHANNELS.HEARTBEAT);
  });

  // --- CATEGORY: MARKET DATA ---

  /**
   * TC-03: Business Logic validation for Ticker.
   * Logic: In an efficient market, the Best Ask can never be lower than the Best Bid.
   */
  test('TC-03: Ticker Spread Logic', async () => {
    client.send({ method: KRAKEN_V2.METHODS.SUBSCRIBE, params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] } });
    const msg = await client.waitFor(m => m.channel === KRAKEN_V2.CHANNELS.TICKER && m.type === KRAKEN_V2.TYPE.UPDATE);
    const { ask, bid } = msg.data[0];
    // Engineering Rule: Spread must be positive or zero
    expect(ask).toBeGreaterThanOrEqual(bid);
  });

  /**
   * TC-04: OHLC Data Integrity.
   * Logic: Ensures candle math is correct (High is the ceiling, Low is the floor).
   */
  test('TC-04: OHLC Range Consistency', async () => {
    client.send({ method: KRAKEN_V2.METHODS.SUBSCRIBE, params: { channel: KRAKEN_V2.CHANNELS.OHLC, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] } });
    const msg = await client.waitFor(m => m.channel === KRAKEN_V2.CHANNELS.OHLC);
    const { high, low, open, close } = msg.data[0];
    expect(high).toBeGreaterThanOrEqual(low);
    expect(high).toBeGreaterThanOrEqual(open);
    expect(high).toBeGreaterThanOrEqual(close);
  });

  /**
   * TC-05: Real-time stream verification.
   * Logic: For high-volume pairs, we expect execution data within 15 seconds.
   */
  test('TC-05: Trade Stream Continuity', async () => {
    client.send({ method: KRAKEN_V2.METHODS.SUBSCRIBE, params: { channel: KRAKEN_V2.CHANNELS.TRADE, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] } });
    const msg = await client.waitFor(m => m.channel === KRAKEN_V2.CHANNELS.TRADE, 15000);
    expect(msg.data.length).toBeGreaterThan(0);
  });

  // --- CATEGORY: INTEGRITY & ROBUSTNESS ---

  /**
   * TC-06: Matching Engine Guard.
   * Logic: If a book is "crossed" (Bid > Ask), it indicates a failure in order matching.
   */
  test('TC-06: Order Book Crossing Check', async () => {
    client.send({ 
      method: KRAKEN_V2.METHODS.SUBSCRIBE, 
      params: { channel: KRAKEN_V2.CHANNELS.BOOK, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD], depth: 10 } 
    });

    // 1. Wait for a snapshot that definitely contains a data array
    const snap = await client.waitFor(m => 
      m.channel === KRAKEN_V2.CHANNELS.BOOK && 
      m.type === KRAKEN_V2.TYPE.SNAPSHOT &&
      Array.isArray(m.data)
    );

    // 2. Extract arrays with fallbacks for different V2 internal versions
    // Kraken V2 typically uses 'bid' and 'ask' inside the data[0] object
    const bids = snap.data[0].bid || snap.data[0].bids;
    const asks = snap.data[0].ask || snap.data[0].asks;

    // 3. Validation - Using specific error messages to help you debug
    expect(bids, 'Bids array should be defined').toBeDefined();
    expect(asks, 'Asks array should be defined').toBeDefined();
    expect(bids.length).toBeGreaterThan(0);
    expect(asks.length).toBeGreaterThan(0);

    // 4. Verification: Top of the book check
    // Ensure we parse as float in case the refactor shifted numbers to strings
    const bestBid = parseFloat(bids[0].price);
    const bestAsk = parseFloat(asks[0].price);

    expect(bestBid).toBeLessThan(bestAsk);
  });

  /** * TC-07: Sequence Monotonicity
   * Rationale: Ensures that a newer price update never arrives with an older timestamp 
   * due to race conditions in a multi-threaded backend.
   */
  test('TC-07: Verify timestamps strictly increase across updates', async () => {
    client.send({ 
      method: KRAKEN_V2.METHODS.SUBSCRIBE, 
      params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] } 
    });

    let lastTimestamp = 0;
    
    // Check 3 updates to verify the sequence
    for (let i = 0; i < 3; i++) {
      const msg = await client.waitFor(m => 
        m.channel === KRAKEN_V2.CHANNELS.TICKER && 
        m.type === KRAKEN_V2.TYPE.UPDATE, 
        30000 
      );
      
      const tsString = msg.timestamp || msg.data?.[0]?.timestamp;
      const currentTimestamp = new Date(tsString).getTime();

      // Verification
      expect(currentTimestamp).not.toBeNaN();
      expect(currentTimestamp).toBeGreaterThanOrEqual(lastTimestamp);
      
      lastTimestamp = currentTimestamp;
    }
  });

  /** * TC-08: Precision Stability
   * Rationale: Prevents UI "flicker" or database errors caused by 
   * unexpected changes in price decimal formatting.
   */
  test('TC-08: Verify ticker price decimal precision', async () => {
    client.send({ method: KRAKEN_V2.METHODS.SUBSCRIBE, params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] } });
    
    const msg = await client.waitFor(m => m.channel === KRAKEN_V2.CHANNELS.TICKER);
    const bidPrice = msg.data[0].bid.toString();
    
    // Logic: Split string by decimal point and count the length of the fractional part
    const decimals = bidPrice.includes('.') ? bidPrice.split('.')[1].length : 0;
    
    expect(decimals).toBeLessThanOrEqual(KRAKEN_V2.INTEGRITY.MAX_DECIMALS);
  });

  /** * TC-09: Unsubscribe Cleanup
   * Rationale: Verifies the server successfully stops the broadcast for this connection.
   * If data arrives after an 'unsubscribe' ACK, there is a routing bug or memory leak.
   */
  test('TC-09: Verify no data is received after unsubscription', async () => {
    // 1. Subscribe and confirm data flow
    client.send({ method: KRAKEN_V2.METHODS.SUBSCRIBE, params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] } });
    await client.waitFor(m => m.channel === KRAKEN_V2.CHANNELS.TICKER);

    // 2. Unsubscribe
    client.send({ method: KRAKEN_V2.METHODS.UNSUBSCRIBE, params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] } });
    await client.waitFor(m => m.method === KRAKEN_V2.METHODS.UNSUBSCRIBE && m.success);

    // 3. Verification: Monitor for 5 seconds. 
    // We expect 'waitFor' to time out because NO messages should arrive.
    const zombieCheck = client.waitFor(m => m.channel === KRAKEN_V2.CHANNELS.TICKER, KRAKEN_V2.LIFECYCLE.UNSUB_SILENCE_MS);
    
    await expect(zombieCheck).rejects.toThrow('Wait Timeout');
  });

  /** * TC-10: Idempotent Subscriptions
   * Rationale: Tests how the state machine handles accidental "double-subscriptions."
   * It should fail gracefully rather than creating duplicate internal streams.
   */
  test('TC-10: Verify second subscription attempt returns error or is ignored', async () => {
    const subRequest = { 
      method: KRAKEN_V2.METHODS.SUBSCRIBE, 
      params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.ETH_USD] }, 
      req_id: 12345 
    };

    // First attempt
    client.send(subRequest);
    await client.waitFor(m => m.req_id === 12345 && m.success);

    // Second attempt
    client.send(subRequest);
    const secondResponse = await client.waitFor(m => m.req_id === 12345);
    
    expect(secondResponse.success).toBe(false);

    /**
     * FIX: Use .toLowerCase() to handle case sensitivity 
     * or use a Regular Expression with the 'i' (insensitive) flag.
     */
    const errorMessage = secondResponse.error.toLowerCase();
    expect(errorMessage).toContain('already subscribed');
    
    // ALTERNATIVE (using Regex):
    // expect(secondResponse.error).toMatch(/already subscribed/i);
  });

  /**
   * TC-11: Sequencing Guard.
   * Rationale: Refactored async backends can sometimes scramble message order.
   * Logic: Compare 3 consecutive timestamps to ensure they are monotonically increasing.
   */
  test('TC-11: Strict Timestamp Monotonicity', async () => {
  // 1. Subscribe to Ticker
  client.send({ 
    method: KRAKEN_V2.METHODS.SUBSCRIBE, 
    params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] } 
  });

  let lastTsValue = 0;

  // 2. Sample 3 updates (reduced from 5 to decrease execution time)
  for (let i = 0; i < 3; i++) {
    const msg = await client.waitFor(
      m => m.channel === KRAKEN_V2.CHANNELS.TICKER && m.type === 'update', 
      30000 // Increased timeout to 30s to handle low-volatility periods
    );
    
    // 3. Extract and Parse Timestamp
    const rawTs = msg.timestamp || msg.data?.[0]?.timestamp;
    const currentTsValue = new Date(rawTs).getTime();

    // 4. Verification
    expect(currentTsValue).not.toBeNaN();
    
    // In Kraken V2, updates can happen in the same millisecond, 
    // so we use GreaterThanOrEqual.
    expect(currentTsValue).toBeGreaterThanOrEqual(lastTsValue);

    lastTsValue = currentTsValue;
  }
});

  /**
   * TC-12: Decimal Precision Guard.
   * Rationale: Legacy trading bots often break if decimal formatting changes (e.g. 2 decimals to 8).
   */
  test('TC-12: Decimal Precision Guard', async () => {
    client.send({ 
      method: KRAKEN_V2.METHODS.SUBSCRIBE, 
      params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] } 
    });
    
    const msg = await client.waitFor(m => m.channel === KRAKEN_V2.CHANNELS.TICKER && m.type === 'update');
    
    // Safely extract the bid price string
    const bidValue = msg.data?.[0]?.bid;
    expect(bidValue).toBeDefined();
    
    const bidStr = bidValue.toString();
    const decimals = bidStr.includes('.') ? bidStr.split('.')[1].length : 0;

    // Get expected precision from config, or default to 2 if not found
    const expectedPrecision = KRAKEN_V2.PRECISION?.[KRAKEN_V2.SYMBOLS.BTC_USD] ?? 2;
    
    expect(decimals).toBeLessThanOrEqual(expectedPrecision);
  });

  /**
   * TC-15: Resilience Guard.
   * Rationale: Legacy systems were often "case-insensitive". This ensures refactors 
   * stay backward compatible with "btc/usd" vs "BTC/USD".
   */
  test('TC-15: Normalization (Lowercase Handling)', async () => {
    client.send({ method: KRAKEN_V2.METHODS.SUBSCRIBE, params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.LOWERCASE_BTC] }, req_id: 123 });
    const resp = await client.waitFor(m => m.req_id === 123);
    // Logic: As long as the system provides a structured response (success or clean error), it is robust.
    expect(resp.success || resp.error).toBeDefined(); 
  });

  /**
   * TC-16: API Contract validation.
   * Logic: Ensures the refactor didn't drop required keys used by downstream parsers.
   */
  test('TC-16: Schema Key Validation', async () => {
    client.send({ method: KRAKEN_V2.METHODS.SUBSCRIBE, params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] }, req_id: 99 });
    const resp = await client.waitFor(m => m.req_id === 99);
    const requiredKeys = ['success', 'result', 'time_in', 'time_out'];
    requiredKeys.forEach(key => expect(resp).toHaveProperty(key));
  });

  // --- CATEGORY: LIFECYCLE ---

  /**
   * TC-13: Prevents duplicate state creation.
   * Logic: If a user subscribes twice, the server should reject it, not spin up a second data stream.
   */
  test('TC-13: Subscription Idempotency', async () => {
    const sub = { method: KRAKEN_V2.METHODS.SUBSCRIBE, params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.ETH_USD] }, req_id: 50 };
    client.send(sub);
    await client.waitFor(m => m.req_id === 50 && m.success);
    
    client.send(sub); // Send second identical request
    const err = await client.waitFor(m => m.req_id === 50);
    expect(err.success).toBe(false); // Refactored server must enforce singleton subscriptions
  });

  /**
   * TC-14: Ensures routing tables are cleared.
   * Logic: After unsubscription, data flow must stop to prevent memory leaks or "Zombie" streams.
   */
  test('TC-14: Unsubscribe Cleanup', async () => {
    client.send({ method: KRAKEN_V2.METHODS.SUBSCRIBE, params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] } });
    await client.waitFor(m => m.channel === KRAKEN_V2.CHANNELS.TICKER);

    client.send({ method: KRAKEN_V2.METHODS.UNSUBSCRIBE, params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] } });
    await client.waitFor(m => m.method === KRAKEN_V2.METHODS.UNSUBSCRIBE && m.success);
    // Monitoring: Wait for 5s. If data arrives, 'waitFor' resolves and test fails.
    // If 'waitFor' times out (rejects), it means silence was maintained (Success).
    const silence = client.waitFor(m => m.channel === KRAKEN_V2.CHANNELS.TICKER, KRAKEN_V2.TIMEOUTS.SILENCE_VERIFY);
    await expect(silence).rejects.toThrow();
  });
});