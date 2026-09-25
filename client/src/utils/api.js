import axios from 'axios'

export class ApiError extends Error {
  constructor(message, { status, code, details, traceId } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.traceId = traceId
  }
}

const TOKEN_KEY = 'vsd:token'

export const getStoredToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export const setStoredToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage unavailable - the session then lasts only for this page load
  }
}

// AuthProvider registers this so any 401 (expired/revoked session) drops
// the user back to the login screen, wherever the request came from.
let onUnauthorized = null
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler
}

// withCredentials so the server's httpOnly session cookie is stored/sent -
// it's what authenticates plain <a href> attachment downloads. API calls
// themselves authenticate with the Bearer header below.
const axiosClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL, withCredentials: true })

axiosClient.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

axiosClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response) {
      const body = err.response.data?.error
      const isLoginCall = err.config?.url?.endsWith('/auth/login')
      if (err.response.status === 401 && !isLoginCall && onUnauthorized) onUnauthorized()
      return Promise.reject(
        new ApiError(body?.message || `Request failed (${err.response.status})`, {
          status: err.response.status,
          code: body?.code,
          details: body?.details,
          traceId: body?.traceId,
        }),
      )
    }
    return Promise.reject(new ApiError('Could not reach the server. Is it running?', { status: 0, code: 'NETWORK_ERROR' }))
  },
)

const unwrap = (promise) => promise.then((res) => res.data)

// Auth
export const login = (email, password) => unwrap(axiosClient.post('/api/v1/auth/login', { email, password }))
export const getMe = () => unwrap(axiosClient.get('/api/v1/auth/me'))
export const changePassword = (currentPassword, newPassword) =>
  unwrap(axiosClient.post('/api/v1/auth/change-password', { currentPassword, newPassword }))
export const logout = () => unwrap(axiosClient.post('/api/v1/auth/logout'))

// Admin controller
export const getRoles = () => unwrap(axiosClient.get('/api/v1/admin/roles'))
export const getPermissionCatalog = () => unwrap(axiosClient.get('/api/v1/admin/permissions'))
export const updateRolePermissions = (roleId, permissions) =>
  unwrap(axiosClient.put(`/api/v1/admin/roles/${roleId}/permissions`, { permissions }))
export const getAdminUsers = () => unwrap(axiosClient.get('/api/v1/admin/users'))
export const setUserPassword = (agentId, password) => unwrap(axiosClient.put(`/api/v1/admin/users/${agentId}/password`, { password }))
export const revokeUserLogin = (agentId) => unwrap(axiosClient.delete(`/api/v1/admin/users/${agentId}/password`))
export const getLoginEvents = () => unwrap(axiosClient.get('/api/v1/admin/login-events'))
export const getMailIntegration = () => unwrap(axiosClient.get('/api/v1/admin/mail-integration'))
export const getGmailAuthUrl = () => unwrap(axiosClient.get('/api/v1/gmail/auth-url'))

// Tickets
export const getTickets = (params) => unwrap(axiosClient.get('/api/v1/tickets', { params }))
export const getTicket = (ticketId) => unwrap(axiosClient.get(`/api/v1/tickets/${ticketId}`))
export const createTicket = (data) => unwrap(axiosClient.post('/api/v1/tickets', data))
export const updateTicket = (ticketId, data) => unwrap(axiosClient.patch(`/api/v1/tickets/${ticketId}`, data))
export const getTicketHistory = (ticketId) => unwrap(axiosClient.get(`/api/v1/tickets/${ticketId}/history`))
export const getTicketResolution = (ticketId) => unwrap(axiosClient.get(`/api/v1/tickets/${ticketId}/resolution`))
export const getTicketMetrics = (ticketId) => unwrap(axiosClient.get(`/api/v1/tickets/${ticketId}/metrics`))
// Assignees (several per ticket) + My Tickets
export const getTicketAssignees = (ticketId) => unwrap(axiosClient.get(`/api/v1/tickets/${ticketId}/assignees`))
export const addTicketAssignees = (ticketId, agentIds, note) =>
  unwrap(axiosClient.post(`/api/v1/tickets/${ticketId}/assignees`, { agentIds, note }))
export const removeTicketAssignee = (ticketId, agentId) => unwrap(axiosClient.delete(`/api/v1/tickets/${ticketId}/assignees/${agentId}`))
export const markTicketSeen = (ticketId) => unwrap(axiosClient.post(`/api/v1/tickets/${ticketId}/assignees/seen`))
// Tracking tab: work states, dependencies, work logs
export const getTicketTracking = (ticketId) => unwrap(axiosClient.get(`/api/v1/tickets/${ticketId}/tracking`))
export const setWorkState = (ticketId, agentId, state, note) =>
  unwrap(axiosClient.patch(`/api/v1/tickets/${ticketId}/assignees/${agentId}/state`, { state, note }))
export const addWorkDependency = (ticketId, agentId, blockerAgentId) =>
  unwrap(axiosClient.post(`/api/v1/tickets/${ticketId}/assignees/${agentId}/dependencies`, { blockerAgentId }))
export const removeWorkDependency = (ticketId, agentId, blockerAgentId) =>
  unwrap(axiosClient.delete(`/api/v1/tickets/${ticketId}/assignees/${agentId}/dependencies/${blockerAgentId}`))
export const addWorklog = (ticketId, agentId, data) => unwrap(axiosClient.post(`/api/v1/tickets/${ticketId}/assignees/${agentId}/worklogs`, data))
export const deleteWorklog = (ticketId, worklogId) => unwrap(axiosClient.delete(`/api/v1/tickets/${ticketId}/worklogs/${worklogId}`))
export const getMyTickets = (params) => unwrap(axiosClient.get('/api/v1/tickets/my', { params }))
export const getMyTicketCounts = () => unwrap(axiosClient.get('/api/v1/tickets/my/counts'))
export const getAgentQueue = (agentId, params) => unwrap(axiosClient.get(`/api/v1/tickets/queues/agent/${agentId}`, { params }))
export const getBankQueue = (bankId, params) => unwrap(axiosClient.get(`/api/v1/tickets/queues/bank/${bankId}`, { params }))

// Conversations & comments
export const getTicketConversations = (ticketId) => unwrap(axiosClient.get(`/api/v1/tickets/${ticketId}/conversations`))
export const addTicketReply = (ticketId, data) => unwrap(axiosClient.post(`/api/v1/tickets/${ticketId}/conversations`, data))
export const getTicketComments = (ticketId) => unwrap(axiosClient.get(`/api/v1/tickets/${ticketId}/comments`))
export const addTicketComment = (ticketId, data) => unwrap(axiosClient.post(`/api/v1/tickets/${ticketId}/comments`, data))

// Attachments
export const getTicketAttachments = (ticketId) => unwrap(axiosClient.get(`/api/v1/tickets/${ticketId}/attachments`))
export const getAttachmentDownloadUrl = (ticketId, attachmentId) =>
  `${import.meta.env.VITE_API_BASE_URL}/api/v1/tickets/${ticketId}/attachments/${attachmentId}/download`

// Contacts
export const getContacts = (params) => unwrap(axiosClient.get('/api/v1/contacts', { params }))
export const getContact = (contactId) => unwrap(axiosClient.get(`/api/v1/contacts/${contactId}`))
export const createContact = (data) => unwrap(axiosClient.post('/api/v1/contacts', data))

// Accounts
export const getAccounts = (params) => unwrap(axiosClient.get('/api/v1/accounts', { params }))
export const getAccount = (accountId) => unwrap(axiosClient.get(`/api/v1/accounts/${accountId}`))

// Agents
export const getAgents = (params) => unwrap(axiosClient.get('/api/v1/agents', { params }))
export const getAgent = (agentId) => unwrap(axiosClient.get(`/api/v1/agents/${agentId}`))
export const createAgent = (data) => unwrap(axiosClient.post('/api/v1/agents', data))
export const updateAgent = (agentId, data) => unwrap(axiosClient.patch(`/api/v1/agents/${agentId}`, data))
export const deleteAgent = (agentId) => unwrap(axiosClient.delete(`/api/v1/agents/${agentId}`))

// Departments
export const getDepartments = () => unwrap(axiosClient.get('/api/v1/departments'))
export const getDepartment = (departmentId) => unwrap(axiosClient.get(`/api/v1/departments/${departmentId}`))
export const createDepartment = (data) => unwrap(axiosClient.post('/api/v1/departments', data))
export const updateDepartment = (departmentId, data) => unwrap(axiosClient.patch(`/api/v1/departments/${departmentId}`, data))
export const deleteDepartment = (departmentId) => unwrap(axiosClient.delete(`/api/v1/departments/${departmentId}`))

// Banks (support team, level, hours, primary/secondary resources).
export const getBanks = (params) => unwrap(axiosClient.get('/api/v1/banks', { params }))
export const getBank = (bankId) => unwrap(axiosClient.get(`/api/v1/banks/${bankId}`))
export const createBank = (data) => unwrap(axiosClient.post('/api/v1/banks', data))
export const updateBank = (bankId, data) => unwrap(axiosClient.patch(`/api/v1/banks/${bankId}`, data))
export const deleteBank = (bankId) => unwrap(axiosClient.delete(`/api/v1/banks/${bankId}`))

// Products
export const getProducts = () => unwrap(axiosClient.get('/api/v1/products'))
export const getProduct = (productId) => unwrap(axiosClient.get(`/api/v1/products/${productId}`))
export const createProduct = (data) => unwrap(axiosClient.post('/api/v1/products', data))
export const updateProduct = (productId, data) => unwrap(axiosClient.patch(`/api/v1/products/${productId}`, data))
export const deleteProduct = (productId) => unwrap(axiosClient.delete(`/api/v1/products/${productId}`))

// Priority SLA config (hours-to-respond per priority, admin-managed)
export const getPrioritySlaConfig = () => unwrap(axiosClient.get('/api/v1/priority-sla'))
export const createPrioritySlaConfig = (priority, slaHours) => unwrap(axiosClient.post('/api/v1/priority-sla', { priority, slaHours }))
export const upsertPrioritySlaConfig = (priority, slaHours) => unwrap(axiosClient.put(`/api/v1/priority-sla/${encodeURIComponent(priority)}`, { slaHours }))
export const deletePrioritySlaConfig = (priority) => unwrap(axiosClient.delete(`/api/v1/priority-sla/${encodeURIComponent(priority)}`))

// Escalation matrix (Config page) + the Escalations queue
export const getEscalationLevels = () => unwrap(axiosClient.get('/api/v1/escalation-levels'))
export const createEscalationLevel = (data) => unwrap(axiosClient.post('/api/v1/escalation-levels', data))
export const updateEscalationLevel = (escalationLevelId, offsetHours) =>
  unwrap(axiosClient.patch(`/api/v1/escalation-levels/${escalationLevelId}`, { offsetHours }))
export const deleteEscalationLevel = (escalationLevelId) => unwrap(axiosClient.delete(`/api/v1/escalation-levels/${escalationLevelId}`))
export const getEscalatedTickets = (params) => unwrap(axiosClient.get('/api/v1/tickets/queues/escalated', { params }))

// Picklists (Status / Classification / Category / Sub Category option lists)
export const getPicklistValues = (field, parentValue) => unwrap(axiosClient.get('/api/v1/picklists', { params: { field, parentValue } }))
export const createPicklistValue = (data) => unwrap(axiosClient.post('/api/v1/picklists', data))
export const updatePicklistValue = (picklistValueId, data) => unwrap(axiosClient.patch(`/api/v1/picklists/${picklistValueId}`, data))
export const deletePicklistValue = (picklistValueId) => unwrap(axiosClient.delete(`/api/v1/picklists/${picklistValueId}`))

export default axiosClient
