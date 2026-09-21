import axios from 'axios'

/**
 * Backend response contract: success -> { data, paging? }, error ->
 * { error: { code, message, details, traceId } }. Every exported function
 * below resolves with the unwrapped body (so callers get { data, paging }
 * directly) and rejects with an ApiError on any failure.
 */
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

// Departments
export const getDepartments = () => unwrap(axiosClient.get('/api/v1/departments'))
export const getDepartment = (departmentId) => unwrap(axiosClient.get(`/api/v1/departments/${departmentId}`))

// Teams
export const getTeams = (params) => unwrap(axiosClient.get('/api/v1/teams', { params }))
export const getTeam = (teamId) => unwrap(axiosClient.get(`/api/v1/teams/${teamId}`))

export default axiosClient
