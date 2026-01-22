import http from './request';

export const login = (username: string) => http.post('/api/login', { username });
export const fetchConversations = () => http.get('/api/conversations');
