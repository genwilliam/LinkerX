import axios from 'axios';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '',
  timeout: 8000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response && err.response.status === 401) {
      console.warn('Unauthorized');
    }
    return Promise.reject(err);
  }
);

export default http;
