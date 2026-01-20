import { METHODS } from "node:http";

/**
 * Global constants for Kraken WebSocket V2.
 * Using a central config ensures that if the API endpoint changes during 
 * the refactor, you only need to update it in one place.
 */
export const KRAKEN_V2 = {
  // Use the production V2 endpoint as our source of truth
  URL: 'wss://ws.kraken.com/v2',
  
  // Test pairs chosen for high liquidity (ensures frequent data updates)
  SYMBOLS: {
    BTC_USD: 'BTC/USD',
    BTC_GBP: 'BTC/GBP',
    ETH_USD: 'ETH/USD',
    SOL_USD: 'SOL/USD',
    LOWERCASE_BTC: 'btc/usd' // Used specifically for normalization testing
  },

  // Official channel names as defined in Kraken V2 documentation
  CHANNELS: {
    TICKER: 'ticker',
    OHLC: 'ohlc',
    BOOK: 'book',
    TRADE: 'trade',
    STATUS: 'status',
    HEARTBEAT: 'heartbeat'
  },

  // Timeouts adjusted for network latency and market activity
  TIMEOUTS: {
    HANDSHAKE: 5000,      // Connection should be fast
    MSG_WAIT: 10000,      // 10s is safe for most market data
    SILENCE_VERIFY: 5000  // How long to wait to confirm a stream is dead
  },

  // Specific settings for Lifecycle and Integrity tests
  INTEGRITY: {
    // TC-07: We check multiple messages to ensure the sequence never breaks
    SAMPLE_SIZE: 3, 
    // TC-08: Expected decimals for BTC/USD ticker strings
    MAX_DECIMALS: 2 
  },
  
  LIFECYCLE: {
    // TC-09: Time to monitor the socket to ensure no 'zombie' data arrives
    UNSUB_SILENCE_MS: 5000 
  },

  PRECISION: {
    'BTC/USD': 2,
    'ETH/USD': 2,
  } as { [key: string]: number },

  METHODS: {
    SUBSCRIBE: 'subscribe',
    UNSUBSCRIBE: 'unsubscribe'
  },
  
  TYPE: {
    UPDATE: 'update',
    SNAPSHOT: 'snapshot'
  }

};



