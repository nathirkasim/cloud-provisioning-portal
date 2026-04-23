import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' }
})

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Redirect to login if token expired
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth
export const login = (email, password) =>
  api.post('/auth/login', { email, password })

export const register = (data) =>
  api.post('/auth/register', data)

export const getMe = () =>
  api.get('/auth/me')

export const iamLogin = (accessKey, secretKey) =>
  api.post('/auth/iam-login', { access_key: accessKey, secret_key: secretKey })

// Tickets
export const getTemplates = () =>
  api.get('/tickets/templates')

export const createTicket = (data) =>
  api.post('/tickets/', data)

export const getMyTickets = () =>
  api.get('/tickets/my')

export const getTicket = (id) =>
  api.get(`/tickets/${id}`)

export const estimateCost = (templateId, durationDays) =>
  api.post(`/tickets/estimate-cost?template_id=${templateId}&duration_days=${durationDays}`)

// Approvals
export const getPendingTickets = () =>
  api.get('/approvals/pending')

export const approveTicket = (id) =>
  api.put(`/approvals/${id}/approve`, {})

export const rejectTicket = (id, reason) =>
  api.put(`/approvals/${id}/reject`, { reason })

export const destroyEnvironment = (id) =>
  api.delete(`/approvals/${id}/destroy`)

// Users
export const getUsers = () =>
  api.get('/users/')

export const updateUserRole = (id, role) =>
  api.put(`/users/${id}/role`, { role })

// Audit logs
export const getAuditLogs = (params) =>
  api.get('/audit-logs/', { params })

export default api

// Admin — get all tickets across all users
export const getAllTickets = (params) =>
  api.get('/approvals/all', { params })

// Quota
export const getQuota = () =>
  api.get('/tickets/quota')

// Portal stats
export const getPortalStats = () =>
  api.get('/approvals/stats')

export const getConsoleLink = (ticketId) =>
  api.get(`/tickets/${ticketId}/console-link`);
