const fs = require("fs");
const attachmentRepository = require("../repositories/attachment.repository");
const ticketService = require("./ticket.service");
const { resolveAttachmentPath } = require("../utils/file-storage");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");

const listByTicket = (ticketId) => {
    ticketService.getTicketById(ticketId);
    return attachmentRepository.findByTicketId(ticketId);
};

const getDownloadable = (ticketId, attachmentId) => {
    ticketService.getTicketById(ticketId);

    const attachment = attachmentRepository.findById(attachmentId);
    if (!attachment || attachment.Ticket_Id !== ticketId) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.ATTACHMENT_NOT_FOUND, "Attachment not found");
    }

    const absolutePath = resolveAttachmentPath(attachment.Storage_Path);
    if (!fs.existsSync(absolutePath)) {
        throw new ApiError(
            HTTP_STATUS.NOT_FOUND,
            ERROR_CODES.ATTACHMENT_NOT_FOUND,
            "Attachment metadata exists but the file is missing from storage"
        );
    }

    return { attachment, absolutePath };
};

module.exports = { listByTicket, getDownloadable };
