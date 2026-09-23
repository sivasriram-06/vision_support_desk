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

const axiosClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL })

axiosClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response) {
      const body = err.response.data?.error
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

// Tickets
export const getTickets = (params) => unwrap(axiosClient.get('/api/v1/tickets', { params }))
export const getTicket = (ticketId) => unwrap(axiosClient.get(`/api/v1/tickets/${ticketId}`))
export const createTicket = (data) => unwrap(axiosClient.post('/api/v1/tickets', data))
export const updateTicket = (ticketId, data) => unwrap(axiosClient.patch(`/api/v1/tickets/${ticketId}`, data))
export const getTicketHistory = (ticketId) => unwrap(axiosClient.get(`/api/v1/tickets/${ticketId}/history`))
export const getTicketResolution = (ticketId) => unwrap(axiosClient.get(`/api/v1/tickets/${ticketId}/resolution`))
export const getTicketMetrics = (ticketId) => unwrap(axiosClient.get(`/api/v1/tickets/${ticketId}/metrics`))
export const getAgentQueue = (agentId, params) => unwrap(axiosClient.get(`/api/v1/tickets/queues/agent/${agentId}`, { params }))
export const getTeamQueue = (teamId, params) => unwrap(axiosClient.get(`/api/v1/tickets/queues/team/${teamId}`, { params }))

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

// Teams
export const getTeams = (params) => unwrap(axiosClient.get('/api/v1/teams', { params }))
export const getTeam = (teamId) => unwrap(axiosClient.get(`/api/v1/teams/${teamId}`))
export const createTeam = (data) => unwrap(axiosClient.post('/api/v1/teams', data))
export const updateTeam = (teamId, data) => unwrap(axiosClient.patch(`/api/v1/teams/${teamId}`, data))
export const deleteTeam = (teamId) => unwrap(axiosClient.delete(`/api/v1/teams/${teamId}`))

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

// Picklists (Status / Classification / Category / Sub Category option lists)
export const getPicklistValues = (field, parentValue) => unwrap(axiosClient.get('/api/v1/picklists', { params: { field, parentValue } }))
export const createPicklistValue = (data) => unwrap(axiosClient.post('/api/v1/picklists', data))
export const updatePicklistValue = (picklistValueId, data) => unwrap(axiosClient.patch(`/api/v1/picklists/${picklistValueId}`, data))
export const deletePicklistValue = (picklistValueId) => unwrap(axiosClient.delete(`/api/v1/picklists/${picklistValueId}`))

export default axiosClient
