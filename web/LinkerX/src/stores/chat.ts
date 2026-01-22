import { defineStore } from 'pinia';

export type Conversation = {
  id: number;
  type: 'dm' | 'group';
  title?: string;
  last_message_at: number;
  last_seq: number;
  read_seq: number;
  pinned_at: number;
};

export type Message = {
  seq: number;
  server_msg_id: string;
  client_msg_id: string;
  from: string;
  payload: any;
  created_at: number;
};

function dedupBySeq(arr: Message[]): Message[] {
  const seen = new Set<number>();
  const res: Message[] = [];
  for (const m of arr) {
    if (seen.has(m.seq)) continue;
    seen.add(m.seq);
    res.push(m);
  }
  return res;
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    conversations: [] as Conversation[],
    messages: new Map<number, Message[]>(),
    readSeq: {} as Record<number, number>,
    activeConversationId: 0,
  }),
  getters: {
    sortedConversations(state) {
      return [...state.conversations].sort((a, b) => {
        if ((b.pinned_at || 0) !== (a.pinned_at || 0)) return (b.pinned_at || 0) - (a.pinned_at || 0);
        return (b.last_message_at || 0) - (a.last_message_at || 0);
      });
    },
    unread: (state) => (cid: number, lastSeq: number) => Math.max(0, lastSeq - (state.readSeq[cid] || 0)),
  },
  actions: {
    setConversations(list: Conversation[]) {
      this.conversations = list;
    },
    setActive(cid: number, lastSeq: number) {
      this.activeConversationId = cid;
      this.readSeq[cid] = Math.max(this.readSeq[cid] || 0, lastSeq);
    },
    addMessages(cid: number, msgs: Message[]) {
      const merged = dedupBySeq([...(this.messages.get(cid) || []), ...msgs]);
      this.messages.set(cid, merged.sort((a, b) => a.seq - b.seq));
    },
    updateReadSeq(cid: number, seq: number) {
      this.readSeq[cid] = Math.max(this.readSeq[cid] || 0, seq);
    },
  },
});
