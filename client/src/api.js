import axios from 'axios';

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ecotrace_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.startsWith('/auth/')) {
      localStorage.removeItem('ecotrace_token');
      if (!location.pathname.startsWith('/login')) location.assign('/login');
    }
    return Promise.reject(err);
  }
);

export const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong';
