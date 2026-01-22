<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="login" v-if="!token">
        <input v-model="username" placeholder="username" />
        <button @click="doLogin">Login</button>
      </div>
      <div class="status" v-else>
        <div>WS: {{ status }}</div>
        <button @click="loadConversations">Refresh</button>
      </div>
      <div class="conversations">
        <div
          v-for="c in store.sortedConversations"
          :key="c.id"
          class="conversation"
          :class="{ active: c.id === store.activeConversationId }"
          @click="selectConversation(c)"
        >
          <div class="title">{{ c.title || `Conv ${c.id}` }}</div>
          <div class="meta">
            <span>{{ formatTime(c.last_message_at) }}</span>
            <span v-if="store.unread(c.id, c.last_seq) > 0" class="unread">{{ store.unread(c.id, c.last_seq) }}</span>
          </div>
        </div>
        <div v-if="store.sortedConversations.length === 0" class="empty">
          No conversations yet.
        </div>
      </div>
    </aside>

    <main class="main">
      <div class="messages" ref="messagesRef">
        <div ref="topSentinel"></div>
        <div v-for="m in currentMessages" :key="m.seq" class="message">
          <div class="msg-meta">#{{ m.seq }} {{ m.from }}</div>
          <div class="msg-body">{{ m.payload?.text }}</div>
        </div>
      </div>
      <div class="composer">
        <input v-model="text" placeholder="Type a message..." @keydown.enter="sendMessage" />
        <button @click="sendMessage">Send</button>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useChatStore } from '../stores/chat';
import { fetchConversations, login } from '../api/conversations';
import { fetchMessages, postReadAck } from '../api/messages';
import { WSClient, type Envelope } from '../ws/WSClient';

const store = useChatStore();
const username = ref('u1');
const token = ref(localStorage.getItem('token') || '');
const status = ref('offline');
const text = ref('');
const topSentinel = ref<HTMLElement | null>(null);
const messagesRef = ref<HTMLElement | null>(null);
let ws: WSClient | null = null;

const currentMessages = computed(() => store.messages.get(store.activeConversationId) || []);

const formatTime = (ts: number) => (ts ? new Date(ts).toLocaleString() : '');

const initWS = () => {
  if (!token.value) return;
  ws = new WSClient('ws://localhost:8080/ws', token.value, {
    onPush(env: Envelope) {
      if (env.type === 'message_push') {
        store.addMessages(env.conversation_id!, [{
          seq: env.seq!,
          server_msg_id: env.server_msg_id!,
          client_msg_id: env.client_msg_id!,
          from: env.from || '',
          payload: env.payload,
          created_at: env.ts!,
        }]);
      }
    },
    onReadSync(env: Envelope) {
      if (env.conversation_id && env.seq) {
        store.updateReadSeq(env.conversation_id, env.seq);
      }
    },
    onStatus(s: string) {
      status.value = s;
    },
    onError(err: any) {
      console.warn(err);
    },
  });
  ws.connect();
};

const doLogin = async () => {
  const res: any = await login(username.value);
  token.value = res.token || res.data?.token;
  localStorage.setItem('token', token.value);
  await loadConversations();
  initWS();
};

const loadConversations = async () => {
  const res: any = await fetchConversations();
  const list = res.data || res;
  store.setConversations(list);
  if (list.length > 0) {
    selectConversation(list[0]);
  }
};

const selectConversation = async (c: any) => {
  store.setActive(c.id, c.last_seq);
  const msgs: any = await fetchMessages(c.id, { after_seq: 0, limit: 50 });
  store.addMessages(c.id, msgs.data || msgs);
  await postReadAck(c.id, c.last_seq);
  ws?.send({ type: 'read_ack', conversation_id: c.id, seq: c.last_seq });
  store.updateReadSeq(c.id, c.last_seq);
};

const sendMessage = () => {
  if (!text.value.trim() || !store.activeConversationId) return;
  ws?.send({
    type: 'message_send',
    conversation_id: store.activeConversationId,
    payload: { type: 'text', text: text.value },
  });
  text.value = '';
};

const observeHistory = () => {
  if (!topSentinel.value) return;
  const io = new IntersectionObserver(async (entries) => {
    if (!entries[0].isIntersecting) return;
    const cid = store.activeConversationId;
    if (!cid) return;
    const list = store.messages.get(cid) || [];
    const oldest = list[0]?.seq || (1 << 62);
    const msgs: any = await fetchMessages(cid, { before_seq: oldest, limit: 50 });
    store.addMessages(cid, msgs.data || msgs);
  }, { threshold: 1.0 });
  io.observe(topSentinel.value);
};

onMounted(() => {
  if (token.value) {
    loadConversations().then(initWS);
  }
  observeHistory();
});
</script>

<style scoped>
.layout { display: flex; height: 100vh; font-family: sans-serif; }
.sidebar { width: 280px; border-right: 1px solid #eee; padding: 12px; box-sizing: border-box; }
.status { margin-bottom: 8px; }
.conversations { overflow-y: auto; height: calc(100vh - 120px); }
.conversation { padding: 8px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.conversation.active { background: #f5f5f5; }
.meta { display: flex; justify-content: space-between; font-size: 12px; color: #666; }
.unread { background: #f44; color: #fff; border-radius: 10px; padding: 0 6px; }
.main { flex: 1; display: flex; flex-direction: column; }
.messages { flex: 1; overflow-y: auto; padding: 12px; }
.message { margin-bottom: 8px; }
.msg-meta { font-size: 12px; color: #666; }
.composer { display: flex; padding: 12px; border-top: 1px solid #eee; gap: 8px; }
.composer input { flex: 1; padding: 8px; }
.empty { color: #999; padding: 8px; }
.login input { width: 100%; padding: 6px; margin-bottom: 6px; }
</style>
