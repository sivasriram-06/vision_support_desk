const express = require("express");
const ticketController = require("../../controllers/ticket.controller");
const conversationController = require("../../controllers/conversation.controller");
const attachmentController = require("../../controllers/attachment.controller");
const validate = require("../../middleware/validate.middleware");
const {
    createTicketSchema,
    updateTicketSchema,
    listTicketsQuerySchema,
    ticketIdParamSchema
} = require("../../schemas/ticket.schema");
const { addReplySchema, addCommentSchema } = require("../../schemas/conversation.schema");

const router = express.Router();

router.get("/queues/agent/:agentId", ticketController.getAgentQueue);
router.get("/queues/team/:teamId", ticketController.getTeamQueue);

router.get("/", validate(listTicketsQuerySchema, "query"), ticketController.listTickets);
router.post("/", validate(createTicketSchema), ticketController.createTicket);

router.get("/:ticketId", validate(ticketIdParamSchema, "params"), ticketController.getTicketById);
router.patch("/:ticketId", validate(ticketIdParamSchema, "params"), validate(updateTicketSchema), ticketController.updateTicket);

router.get("/:ticketId/history", ticketController.getTicketHistory);
router.get("/:ticketId/resolution", ticketController.getTicketResolution);
router.get("/:ticketId/metrics", ticketController.getTicketMetrics);

router.get("/:ticketId/conversations", conversationController.listConversations);
router.post("/:ticketId/conversations", validate(addReplySchema), conversationController.addReply);

router.get("/:ticketId/comments", conversationController.listComments);
router.post("/:ticketId/comments", validate(addCommentSchema), conversationController.addComment);

router.get("/:ticketId/attachments", attachmentController.listAttachments);
router.get("/:ticketId/attachments/:attachmentId/download", attachmentController.downloadAttachment);

module.exports = router;
