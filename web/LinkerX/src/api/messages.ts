import http from './request';

export const fetchMessages = (conversation_id: number, params: { before_seq?: number; after_seq?: number; limit?: number }) =>
  http.get('/api/messages', { params: { conversation_id, ...params } });

export const postReadAck = (conversation_id: number, seq: number) =>
  http.post('/api/read_ack', { conversation_id, seq });
