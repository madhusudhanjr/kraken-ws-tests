import WebSocket from 'ws';

// Using a named export
export class KrakenClient {
  private ws: WebSocket;

  constructor(url: string) {
    this.ws = new WebSocket(url);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection Timeout')), 5000);
      this.ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });
      this.ws.on('error', (err) => reject(err));
    });
  }

  send(payload: object) {
    this.ws.send(JSON.stringify(payload));
  }

  async waitFor(predicate: (msg: any) => boolean, timeout = 20000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Wait Timeout: Message not received within ${timeout}ms`));
      }, timeout);

      const listener = (data: Buffer) => {
        const msg = JSON.parse(data.toString());
        
        // To debug what Kraken is sending if the test hangs
        // console.log('DEBUG MSG:', JSON.stringify(msg));

        if (predicate(msg)) {
          clearTimeout(timer);
          this.ws.off('message', listener);
          resolve(msg);
        }
      };
      this.ws.on('message', listener);
    });
  }

  close() {
    if (this.ws) this.ws.terminate();
  }
}