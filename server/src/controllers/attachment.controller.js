const attachmentService = require("../services/attachment.service");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const listAttachments = (req, res, next) => {
    try {
        const attachments = attachmentService.listByTicket(req.params.ticketId);
        ok(res, HTTP_STATUS.OK, attachments);
    } catch (error) {
        next(error);
    }
};

const downloadAttachment = (req, res, next) => {
    try {
        const { attachment, absolutePath } = attachmentService.getDownloadable(req.params.ticketId, req.params.attachmentId);
        res.download(absolutePath, attachment.File_Name);
    } catch (error) {
        next(error);
    }
};

module.exports = { listAttachments, downloadAttachment };
