const express = require("express");
const requirePermission = require("../../middleware/authorize.middleware");
const { PERMISSIONS } = require("../../constants/permissions");
const ticketController = require("../../controllers/ticket.controller");
const conversationController = require("../../controllers/conversation.controller");
const attachmentController = require("../../controllers/attachment.controller");
const validate = require("../../middleware/validate.middleware");
const {
    createTicketSchema,
    updateTicketSchema,
    listTicketsQuerySchema,
    escalatedTicketsQuerySchema,
    addAssigneesSchema,
    assigneeParamSchema,
    myTicketsQuerySchema,
    workStateSchema,
    dependencySchema,
    dependencyParamSchema,
    worklogSchema,
    worklogParamSchema,
    ticketIdParamSchema
} = require("../../schemas/ticket.schema");
const assignmentController = require("../../controllers/ticket-assignment.controller");
const workController = require("../../controllers/ticket-work.controller");
const { addReplySchema, addCommentSchema } = require("../../schemas/conversation.schema");

const router = express.Router();

router.use(requirePermission(PERMISSIONS.TICKETS_VIEW));

router.get("/queues/agent/:agentId", ticketController.getAgentQueue);
router.get("/queues/bank/:bankId", ticketController.getBankQueue);
router.get("/queues/escalated", validate(escalatedTicketsQuerySchema, "query"), ticketController.listEscalatedTickets);
router.get("/my", validate(myTicketsQuerySchema, "query"), assignmentController.myTickets);
router.get("/my/counts", assignmentController.myTicketCounts);

router.get("/", validate(listTicketsQuerySchema, "query"), ticketController.listTickets);
router.post("/", requirePermission(PERMISSIONS.TICKETS_CREATE), validate(createTicketSchema), ticketController.createTicket);

router.get("/:ticketId", validate(ticketIdParamSchema, "params"), ticketController.getTicketById);
router.patch("/:ticketId", validate(ticketIdParamSchema, "params"), validate(updateTicketSchema), ticketController.updateTicket);

// Assignees: permission rules live in ticket-assignment.service.js (same
// team = team lead, cross team = anyone working tickets).
router.get("/:ticketId/assignees", validate(ticketIdParamSchema, "params"), assignmentController.listAssignments);
router.post("/:ticketId/assignees", validate(ticketIdParamSchema, "params"), validate(addAssigneesSchema), assignmentController.addAssignees);
router.delete("/:ticketId/assignees/:agentId", validate(assigneeParamSchema, "params"), assignmentController.removeAssignee);
router.post("/:ticketId/assignees/seen", validate(ticketIdParamSchema, "params"), assignmentController.markSeen);

// Work tracking (Tracking tab): each assignee's work state, what it waits
// on, and effort. Rules in ticket-work.service.js.
router.get("/:ticketId/tracking", validate(ticketIdParamSchema, "params"), workController.getTracking);
router.patch("/:ticketId/assignees/:agentId/state", validate(assigneeParamSchema, "params"), validate(workStateSchema), workController.changeState);
router.post("/:ticketId/assignees/:agentId/dependencies", validate(assigneeParamSchema, "params"), validate(dependencySchema), workController.addDependency);
router.delete("/:ticketId/assignees/:agentId/dependencies/:blockerAgentId", validate(dependencyParamSchema, "params"), workController.removeDependency);
router.post("/:ticketId/assignees/:agentId/worklogs", validate(assigneeParamSchema, "params"), validate(worklogSchema), workController.addWorklog);
router.delete("/:ticketId/worklogs/:worklogId", validate(worklogParamSchema, "params"), workController.deleteWorklog);

router.get("/:ticketId/history", ticketController.getTicketHistory);
router.get("/:ticketId/resolution", ticketController.getTicketResolution);
router.get("/:ticketId/metrics", ticketController.getTicketMetrics);

router.get("/:ticketId/conversations", conversationController.listConversations);
router.post("/:ticketId/conversations", requirePermission(PERMISSIONS.TICKETS_REPLY), validate(addReplySchema), conversationController.addReply);

router.get("/:ticketId/comments", conversationController.listComments);
router.post("/:ticketId/comments", requirePermission(PERMISSIONS.TICKETS_REPLY), validate(addCommentSchema), conversationController.addComment);

router.get("/:ticketId/attachments", attachmentController.listAttachments);
router.get("/:ticketId/attachments/:attachmentId/download", attachmentController.downloadAttachment);

module.exports = router;
