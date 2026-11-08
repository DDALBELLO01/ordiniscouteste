import axios from 'axios'

axios.interceptors.request.use(config => {
  if (config.url?.startsWith('/api/admin/')) {
    const token = localStorage.getItem('adminToken')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

axios.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && error.config?.url?.startsWith('/api/admin/') &&
      error.config.url !== '/api/admin/login') {
    localStorage.removeItem('adminToken')
    window.dispatchEvent(new Event('session-expired'))
  }
  return Promise.reject(error)
})
