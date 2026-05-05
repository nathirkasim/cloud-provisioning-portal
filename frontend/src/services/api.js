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

export const createCustomRequest = (data) =>
  api.post('/tickets/custom-request', data)

// Approvals
export const getPendingTickets = () =>
  api.get('/approvals/pending')

export const approveTicket = (id) =>
  api.put(`/approvals/${id}/approve`, {})

export const rejectTicket = (id, reason) =>
  api.put(`/approvals/${id}/reject`, { reason })

export const autoCheckTicket = (id) =>
  api.post(`/approvals/${id}/auto-check`)

export const destroyEnvironment = (id) =>
  api.delete(`/approvals/${id}/destroy`)

export const markInProgress = (id) =>
  api.put(`/approvals/${id}/mark-in-progress`, {})

export const completeManualSetup = (id, data) =>
  api.put(`/approvals/${id}/manual-complete`, data)

// Users
export const getUsers = () =>
  api.get('/users/')

export const updateUserRole = (id, role) =>
  api.put(`/users/${id}/role`, { role })

export const deactivateUser = (id) =>
  api.delete(`/users/${id}`)

export const getUserQuota = (id) =>
  api.get(`/users/${id}/quota`)

export const updateUserQuota = (id, data) =>
  api.put(`/users/${id}/quota`, data)

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
  api.get(`/tickets/${ticketId}/console-link`)

export const extendEnvironment = (id, additionalDays) =>
  api.put(`/tickets/${id}/extend`, { additional_days: additionalDays })

export const cancelTicket = (id) =>
  api.delete(`/tickets/${id}/cancel`)

export const getUploadUrl = (ticketId, filename) =>
  api.post(`/tickets/${ticketId}/upload-url`, { filename });

export const updateMe = (data) =>
  api.put('/auth/me', data)

export const changePassword = (data) =>
  api.post('/auth/change-password', data)
