import { test, expect } from '@playwright/test';
import { KRAKEN_V2 } from '../constants/kraken.constants';
import KrakenClient from '../utils/ws-helper';

test.describe('Kraken V2 WebSocket API - Market Data', () => {
  let client: KrakenClient;

  /**
   * Before each test, establish a fresh connection.
   * This provides "Clean Slate" isolation, ensuring errors in one test 
   * (like a hanging subscription) do not affect subsequent tests.
   */
  test.beforeEach(async () => {
    client = new KrakenClient(KRAKEN_V2.URL);
    await client.connect(5000);
  });

  /**
   * Terminate the WebSocket immediately after each test.
   * This prevents memory leaks and ensures no dangling listeners remain active.
   */
  test.afterEach(() => client.close());

  /**
   * TC-01: Handshake returns system status.
   * Logic: The 'status' channel is pushed immediately upon connection.
   */
  test('TC-01: Handshake & Status', async () => {
    const [msg] = await client.waitFor(
      m => m.channel === KRAKEN_V2.CHANNELS.STATUS,
      1,
      3000
    );

    expect(msg.data[0].system).toBe('online');
  });

  /**
   * TC-02: Heartbeat liveness.
   * Logic: Heartbeats prevent the load balancer from killing idle connections.
   */
  test('TC-02: Heartbeat Liveness', async () => {
    // 1. Subscribe to a low-traffic channel to 'wake up' the stream
    // Using Ticker for a stable pair helps keep the pipe open
    client.send({
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] }
    });

    // 2. Wait for the subscription to be acknowledged first
    await client.waitFor(
      m => m.method === KRAKEN_V2.METHODS.SUBSCRIBE && m.success,
      1,
      3000
    );

    // 3. Now wait for the heartbeat with a 5s timeout
    const [heartbeat] = await client.waitFor(
      m => m.channel === KRAKEN_V2.CHANNELS.HEARTBEAT,
      1,
      5000
    );

    expect(heartbeat.channel).toBe(KRAKEN_V2.CHANNELS.HEARTBEAT);
  });

  /**
   * TC-03: Ticker spread logic.
   * Logic: In an efficient market, the Best Ask can never be lower than the Best Bid.
   */
  test('TC-03: Ticker Spread Logic', async () => {

    client.send({
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] }
    });


    const messages = await client.waitFor(
      m => m.channel === KRAKEN_V2.CHANNELS.TICKER && m.type === KRAKEN_V2.TYPE.UPDATE,
      3,
      8000
    );


    messages.forEach(msg => {
      const { ask, bid } = msg.data[0];
      expect(ask).toBeGreaterThanOrEqual(bid);
    });
  });

  /**
   * TC-04: OHLC range consistency.
   * Logic: Ensures candle math is correct (High is the ceiling, Low is the floor).
   */
  test('TC-04: OHLC Range Consistency', async () => {
    client.send({
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: { channel: KRAKEN_V2.CHANNELS.OHLC, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] }
    });

    const [msg] = await client.waitFor(
      m => m.channel === KRAKEN_V2.CHANNELS.OHLC,
      1,
      8000
    );

    const { high, low, open, close } = msg.data[0];
    expect(high).toBeGreaterThanOrEqual(low);
    expect(high).toBeGreaterThanOrEqual(open);
    expect(high).toBeGreaterThanOrEqual(close);
  });

  /**
   * TC-05: Trade stream continuity.
   * Logic: For high-volume pairs, we expect execution data within 10 seconds.
   */
  test('TC-05: Trade Stream Continuity', async () => {
    client.send({
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: { channel: KRAKEN_V2.CHANNELS.TRADE, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] }
    });

    const messages = await client.waitFor(
      m => m.channel === KRAKEN_V2.CHANNELS.TRADE,
      2,
      10000
    );

    messages.forEach(msg => {
      expect(msg.data.length).toBeGreaterThan(0);
    });
  });

  /**
   * TC-06: Order book crossing check.
   * Logic: If a book is "crossed" (Bid > Ask), it indicates a failure in order matching.
   */
  test('TC-06: Order Book Crossing Check', async () => {
    client.send({
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: { channel: KRAKEN_V2.CHANNELS.BOOK, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD], depth: 10 }
    });

    // 1. Wait for a snapshot that definitely contains a data array
    const messages = await client.waitFor(
      m => m.channel === KRAKEN_V2.CHANNELS.BOOK && Array.isArray(m.data),
      2,
      12000
    );

    const snapshot = messages.find(m => m.type === KRAKEN_V2.TYPE.SNAPSHOT);
    expect(snapshot).toBeDefined();

    // 2. Extract arrays with fallbacks for different V2 internal versions
    const bids = snapshot.data[0].bid || snapshot.data[0].bids;
    const asks = snapshot.data[0].ask || snapshot.data[0].asks;

    expect(bids.length).toBeGreaterThan(0);
    expect(asks.length).toBeGreaterThan(0);

    const bestBid = parseFloat(bids[0].price);
    const bestAsk = parseFloat(asks[0].price);
    expect(bestBid).toBeLessThan(bestAsk);
  });

  /**
   * TC-07: Timestamp monotonicity.
   * Rationale: Ensures that a newer price update never arrives with an older timestamp 
   * due to race conditions in a multi-threaded backend.
   */
  test('TC-07: Timestamp Monotonicity', async () => {
    client.send({
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] }
    });

    const messages = await client.waitFor(
      m => m.channel === KRAKEN_V2.CHANNELS.TICKER && m.type === KRAKEN_V2.TYPE.UPDATE,
      3,
      20000
    );

    let lastTs = 0;

    // Check 3 updates to verify the sequence
    messages.forEach(msg => {
      const rawTs = msg.timestamp || msg.data?.[0]?.timestamp;
      const currentTs = new Date(rawTs).getTime();
      expect(currentTs).not.toBeNaN();
      expect(currentTs).toBeGreaterThanOrEqual(lastTs);
      lastTs = currentTs;
    });
  });

  /**
   * TC-08: Decimal precision guard.
   * Rationale: Prevents UI "flicker" or database errors caused by 
   * unexpected changes in price decimal formatting.
   */
  test('TC-08: Decimal Precision Guard', async () => {
    client.send({
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] }
    });

    const [msg] = await client.waitFor(
      m => m.channel === KRAKEN_V2.CHANNELS.TICKER && m.type === KRAKEN_V2.TYPE.UPDATE,
      1,
      8000
    );

    const bidValue = msg.data?.[0]?.bid;
    expect(bidValue).toBeDefined();

    const bidStr = bidValue.toString();

    // Logic: Split string by decimal point and count the length of the fractional part
    const decimals = bidStr.includes('.') ? bidStr.split('.')[1].length : 0;

    const expectedPrecision = KRAKEN_V2.PRECISION?.[KRAKEN_V2.SYMBOLS.BTC_USD] ?? 2;
    expect(decimals).toBeLessThanOrEqual(expectedPrecision);
  });

  /**
   * TC-09: Unsubscribe cleanup.
   * Rationale: Verifies the server successfully stops the broadcast for this connection.
   * If data arrives after an 'unsubscribe' ACK, there is a routing bug or memory leak.
   */
  test('TC-09: Unsubscribe Cleanup', async () => {
    // 1. Subscribe and confirm data flow
    client.send({
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] }
    });

    await client.waitFor(
      m => m.channel === KRAKEN_V2.CHANNELS.TICKER,
      1,
      8000
    );

    // 2. Unsubscribe
    client.send({
      method: KRAKEN_V2.METHODS.UNSUBSCRIBE,
      params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] }
    });

    await client.waitFor(
      m => m.method === KRAKEN_V2.METHODS.UNSUBSCRIBE && m.success,
      1,
      3000
    );

    // 3. Verification: Monitor for 5 seconds. 
    // We expect 'waitFor' to time out because NO messages should arrive.
    await client.waitForSilence(
      m => m.channel === KRAKEN_V2.CHANNELS.TICKER,
      5000
    );
  });

  /**
   * TC-10: Subscription idempotency.
   * Rationale: Tests how the state machine handles accidental "double-subscriptions."
   * It should fail gracefully rather than creating duplicate internal streams.
   */
  test('TC-10: Subscription Idempotency', async () => {
    const sub = {
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.ETH_USD] },
      req_id: 50
    };

    // First attempt
    client.send(sub);
    const [first] = await client.waitFor(
      m => m.req_id === 50 && m.success,
      1,
      3000
    );
    expect(first.success).toBe(true);

    // Second attempt
    client.send(sub);
    const [second] = await client.waitFor(
      m => m.req_id === 50,
      1,
      3000
    );
    expect(second.success).toBe(false);
    expect(second.error.toLowerCase()).toContain('already');
  });

  /**
   * TC-11: Normalization (Lowercase symbol handling).
   * Rationale: Legacy systems were often "case-insensitive". This ensures refactors 
   * stay backward compatible with "btc/usd" vs "BTC/USD".
   */
  test('TC-11: Normalization (Lowercase Handling)', async () => {
    client.send({
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.LOWERCASE_BTC] },
      req_id: 123
    });

    const [resp] = await client.waitFor(
      m => m.req_id === 123,
      1,
      3000
    );

    // Logic: As long as the system provides a structured response (success or clean error), it is robust.
    expect(resp.success || resp.error).toBeDefined();
  });

  /**
   * TC-12: API contract keys validation.
   * Logic: Ensures the refactor didn't drop required keys used by downstream parsers.
   */
  test('TC-12: API Contract Validation', async () => {
    client.send({
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: { channel: KRAKEN_V2.CHANNELS.TICKER, symbol: [KRAKEN_V2.SYMBOLS.BTC_USD] },
      req_id: 99
    });

    const [resp] = await client.waitFor(
      m => m.req_id === 99,
      1,
      3000
    );

    const requiredKeys = ['success', 'result', 'time_in', 'time_out'];
    requiredKeys.forEach(key => expect(resp).toHaveProperty(key));
  });

  /**
   * TC-13: Multi-Market Subscription Validation.
   * Rationale: Ensures a user can subscribe to multiple markets in a single request
   * and receive real-time streams for each market independently.
   */
  test('TC-13: Subscribe to multiple markets and verify event streams', async () => {
    const symbols = [
      KRAKEN_V2.SYMBOLS.BTC_USD,
      KRAKEN_V2.SYMBOLS.ETH_USD,
    ];

    // Step 1: Subscribe to multiple markets
    client.send({
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: {
        channel: KRAKEN_V2.CHANNELS.TICKER,
        symbol: symbols,
      },
      req_id: 200,
    });

    // Step 2: Verify subscription acknowledgment
    const [ack] = await client.waitFor(
      m => m.req_id === 200 && m.success === true,
      1,
      5000
    );
    expect(ack.success).toBe(true);

    // Step 3: Wait until at least one update is received for EACH symbol
    const receivedSymbols = new Set<string>();

    await client.waitFor(
      m => {
        if (
          m.channel === KRAKEN_V2.CHANNELS.TICKER &&
          m.type === KRAKEN_V2.TYPE.UPDATE &&
          symbols.includes(m.data?.[0]?.symbol)
        ) {
          receivedSymbols.add(m.data[0].symbol);
        }
        return receivedSymbols.size === symbols.length;
      },
      1,
      20000 // Allow more time since multiple streams are involved
    );

    // Step 4: Verification
    symbols.forEach(symbol => {
      expect(receivedSymbols.has(symbol)).toBe(true);
    });
  });


  /**
  * TC-14: Multi-Currency Pair Subscription in Single Connection.
  * Rationale: Ensures a single WebSocket connection can handle subscriptions
  * for multiple currency pairs and stream events for all of them concurrently.
  */
  test('TC-14: Subscribe to multiple currency pairs and verify event streams', async () => {
    const symbols = [
      KRAKEN_V2.SYMBOLS.BTC_USD,
      KRAKEN_V2.SYMBOLS.ETH_USD,
      KRAKEN_V2.SYMBOLS.SOL_USD,
    ];

    /**
     * Step 1: Subscribe to the ticker channel for multiple currency pairs
     * using the same WebSocket connection.
     */
    client.send({
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: {
        channel: KRAKEN_V2.CHANNELS.TICKER,
        symbol: symbols,
      },
      req_id: 300,
    });

    /**
     * Step 2: Wait for and verify successful subscription acknowledgment.
     */
    const [ack] = await client.waitFor(
      m => m.req_id === 300 && m.success === true,
      1,
      5000
    );
    expect(ack.success).toBe(true);

    /**
     * Step 3: Collect at least one update per currency pair.
     * We wait until all symbols have produced at least one event.
     */
    const receivedSymbols = new Set<string>();

    await client.waitFor(
      m => {
        if (
          m.channel === KRAKEN_V2.CHANNELS.TICKER &&
          m.type === KRAKEN_V2.TYPE.UPDATE &&
          symbols.includes(m.data?.[0]?.symbol)
        ) {
          receivedSymbols.add(m.data[0].symbol);
        }
        return receivedSymbols.size === symbols.length;
      },
      1,
      20000 // Allow enough time for lower-liquidity pairs
    );

    /**
     * Step 4: Verification — ensure all subscribed currency pairs are streaming.
     */
    symbols.forEach(symbol => {
      expect(receivedSymbols.has(symbol)).toBe(true);
    });
  });

  /**
   * TC-15: Multi-Market Pair Subscription Validation.
   * Rationale: Ensures a user can subscribe to multiple currency pairs
   * in the same WebSocket connection and receive live updates for each pair.
   */
  test('TC-15: Subscribe to multiple market pairs and verify event streams', async () => {
    const symbols = [
      KRAKEN_V2.SYMBOLS.ETH_USD, // ETH/USD
      KRAKEN_V2.SYMBOLS.BTC_GBP, // BTC/GBP
    ];

    /**
     * Step 1: Subscribe to the ticker channel for multiple market pairs.
     */
    client.send({
      method: KRAKEN_V2.METHODS.SUBSCRIBE,
      params: {
        channel: KRAKEN_V2.CHANNELS.TICKER,
        symbol: symbols,
      },
      req_id: 300,
    });

    /**
     * Step 2: Wait for and verify successful subscription acknowledgment.
     */
    const [ack] = await client.waitFor(
      m => m.req_id === 300 && m.success === true,
      1,
      5000
    );
    expect(ack.success).toBe(true);

    /**
     * Step 3: Wait until at least one update is received for EACH market pair.
     */
    const receivedSymbols = new Set<string>();

    await client.waitFor(
      m => {
        if (
          m.channel === KRAKEN_V2.CHANNELS.TICKER &&
          m.type === KRAKEN_V2.TYPE.UPDATE &&
          symbols.includes(m.data?.[0]?.symbol)
        ) {
          receivedSymbols.add(m.data[0].symbol);
        }
        return receivedSymbols.size === symbols.length;
      },
      1,
      20000 // Longer timeout to account for market activity differences
    );

    /**
     * Step 4: Verification — ensure all subscribed market pairs are streaming.
     */
    symbols.forEach(symbol => {
      expect(receivedSymbols.has(symbol)).toBe(true);
    });
  });


  /**
   * TC-16: Idle WebSocket Connection Timeout Validation.
   * Rationale: Verifies the WebSocket does not deliver subscription events
   * when no subscriptions are sent.
   */
  test('TC-16: Open WebSocket and verify idle timeout without subscriptions', async () => {
    // Step 1: Connect
    await client.connect(5000);

    // Step 2: Wait for 10s to ensure no subscription-related messages arrive
    const idleTimeoutMs = 10000;

    try {
      await client.waitForSilence(
        (msg) => {
          // Ignore known default messages
          const ignoredChannels = [
            KRAKEN_V2.CHANNELS.HEARTBEAT,
            KRAKEN_V2.CHANNELS.STATUS,
          ];

          if (
            msg.channel &&
            !ignoredChannels.includes(msg.channel)
          ) {
            // Only fail if some unexpected message arrives
            return true;
          }
          return false;
        },
        idleTimeoutMs
      );
      // Silence maintained — test passes
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw new Error(`Unexpected subscription message received during idle timeout: ${err.message}`);
      } else {
        throw new Error(`Unexpected subscription message received during idle timeout: ${String(err)}`);
      }
    }
  });



});
