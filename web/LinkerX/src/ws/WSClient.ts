import { v4 as uuidv4 } from 'uuid';

export type Envelope = {
  type: string;
  trace_id?: string;
  client_msg_id?: string;
  server_msg_id?: string;
  conversation_id?: number;
  seq?: number;
  ts?: number;
  payload?: any;
  ack_type?: string;
  from?: string;
};

type Callbacks = {
  onPush: (env: Envelope) => void;
  onReadSync?: (env: Envelope) => void;
  onStatus?: (s: string) => void;
  onError?: (err: any) => void;
};

export class WSClient {
  private ws?: WebSocket;
  private queue: Envelope[] = [];
  private inflight = new Map<string, Envelope>();
  private reconnectAttempts = 0;
  private heartbeat?: number;
  private lastSeq = 0;

  constructor(private baseUrl: string, private token: string, private cb: Callbacks) {}

  setToken(t: string) {
    this.token = t;
  }

  setLastSeq(s: number) {
    this.lastSeq = s;
  }

  connect() {
    const qs = `?token=${this.token}&last_seq=${this.lastSeq}`;
    this.ws = new WebSocket(this.baseUrl + qs);
    this.cb.onStatus?.('connecting');
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.cb.onStatus?.('connected');
      this.flush();
      this.startPing();
    };
    this.ws.onmessage = (e) => this.handle(JSON.parse(e.data));
    this.ws.onclose = () => this.reconnect();
    this.ws.onerror = (e) => {
      this.cb.onError?.(e);
      this.ws?.close();
    };
  }

  private startPing() {
    this.stopPing();
    this.heartbeat = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000);
  }

  private stopPing() {
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  private reconnect() {
    this.stopPing();
    this.cb.onStatus?.('reconnecting');
    const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts++));
    setTimeout(() => this.connect(), delay);
  }

  send(env: Envelope) {
    env.client_msg_id ||= uuidv4();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(env));
      this.inflight.set(env.client_msg_id!, env);
    } else {
      this.queue.push(env);
    }
  }

  private flush() {
    while (this.queue.length && this.ws?.readyState === WebSocket.OPEN) {
      this.send(this.queue.shift()!);
    }
  }

  private handle(env: Envelope) {
    switch (env.type) {
      case 'pong':
        return;
      case 'server_ack':
        if (env.ack_type === 'send' && env.client_msg_id) {
          this.inflight.delete(env.client_msg_id);
        }
        return;
      case 'message_push':
        if (env.seq && env.seq > this.lastSeq) this.lastSeq = env.seq;
        this.cb.onPush(env);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'server_ack', ack_type: 'deliver', conversation_id: env.conversation_id, seq: env.seq }));
        }
        return;
      case 'read_sync':
        this.cb.onReadSync?.(env);
        return;
      case 'error':
        this.cb.onError?.(env);
        return;
    }
  }
}
