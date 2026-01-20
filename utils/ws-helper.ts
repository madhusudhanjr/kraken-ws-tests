import WebSocket from 'ws';

type Message = any;
type Condition = (msg: Message) => boolean;

export default class KrakenClient {
  private ws!: WebSocket;
  private messageHandlers: Set<(msg: Message) => void> = new Set();

  constructor(private url: string) {}

  async connect(timeout = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      const timer = setTimeout(() => {
        this.ws.terminate();
        reject(new Error('Connection Timeout'));
      }, timeout);

      this.ws.on('open', () => {
        clearTimeout(timer);
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        const msg = JSON.parse(data.toString());
        this.messageHandlers.forEach(handler => handler(msg));
      });

      this.ws.on('error', err => reject(err));
    });
  }

  send(payload: object): void {
    this.ws.send(JSON.stringify(payload));
  }

  async waitFor(condition: Condition, count = 1, timeout = 8000): Promise<Message[]> {
    return new Promise((resolve, reject) => {
      const results: Message[] = [];

      const handler = (msg: Message) => {
        if (condition(msg)) {
          results.push(msg);
          if (results.length === count) {
            cleanup();
            resolve(results);
          }
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout: Only received ${results.length}/${count} messages`));
      }, timeout);

      const cleanup = () => {
        clearTimeout(timer);
        this.messageHandlers.delete(handler);
      };

      this.messageHandlers.add(handler);
    });
  }

  async waitForSilence(condition: Condition, timeout = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler = (msg: Message) => {
        if (condition(msg)) {
          cleanup();
          reject(new Error('Message received during silence window'));
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, timeout);

      const cleanup = () => {
        clearTimeout(timer);
        this.messageHandlers.delete(handler);
      };

      this.messageHandlers.add(handler);
    });
  }

  close(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}
