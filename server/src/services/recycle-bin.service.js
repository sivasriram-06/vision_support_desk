const fs = require("fs");
const path = require("path");
const { getDB } = require("../config/db");
const env = require("../config/env");
const DB_TABLES = require("../constants/db-tables");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { TICKET_HISTORY_EVENT } = require("../constants/ticket.constants");
const ticketRepository = require("../repositories/ticket.repository");
const gmailIngestedMessageRepository = require("../repositories/gmail-ingested-message.repository");
const organizationService = require("./organization.service");
const { recordHistory } = require("./ticket.service");
const { resolveAttachmentPath } = require("../utils/file-storage");
const { publish, REALTIME_EVENT } = require("../realtime/bus");
const { toIst } = require("../utils/time");
const logger = require("../utils/logger");

/**
 * Recycle bin: tickets a person deleted (Delete ticket, tickets.delete).
 * They can be restored for RECYCLE_BIN_DAYS days from the delete; after
 * that the purge job removes them for good - the ticket, its mails, notes,
 * history, work records and attachment files. Tickets hidden by the Gmail
 * deletion sync are not in the bin: they follow the mailbox (back from
 * Gmail Trash = back on the desk) and are never purged here.
 *
 * The delete time is the latest TICKET_DELETED history row, so no column
 * is needed on HD_TICKET_MASTER.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const purgeTimeOf = (deletedTime) => toIst(new Date(new Date(deletedTime).getTime() + env.recycleBinDays * DAY_MS));

// Deleted tickets whose latest delete/restore event is a person's delete.
const IN_BIN_SQL = `
    SELECT t.Ticket_Id, t.Ticket_Number, t.Subject, t.Status, t.Priority, t.Created_Time,
           TRIM(COALESCE(c.First_Name, '') || ' ' || COALESCE(c.Last_Name, '')) AS Contact_Name, c.Email AS Contact_Email,
           b.Bank_Name, d.Department_Name,
           h.Event_Time AS Deleted_Time, h.Actor_Agent_Id AS Deleted_By,
           TRIM(COALESCE(a.First_Name, '') || ' ' || COALESCE(a.Last_Name, '')) AS Deleted_By_Name
    FROM ${DB_TABLES.TICKET} t
    JOIN ${DB_TABLES.TICKET_HISTORY} h ON h.History_Id = (
        SELECT h2.History_Id FROM ${DB_TABLES.TICKET_HISTORY} h2
        WHERE h2.Ticket_Id = t.Ticket_Id AND h2.Event_Name IN ('TICKET_DELETED', 'TICKET_RESTORED') AND h2.Is_Deleted = 'N'
        ORDER BY h2.Event_Time DESC, h2.History_Id DESC LIMIT 1
    )
    LEFT JOIN ${DB_TABLES.CONTACT} c ON c.Contact_Id = t.Contact_Id
    LEFT JOIN ${DB_TABLES.BANK} b ON b.Bank_Id = t.Bank_Id
    LEFT JOIN ${DB_TABLES.DEPARTMENT} d ON d.Department_Id = t.Department_Id
    LEFT JOIN ${DB_TABLES.AGENT} a ON a.Agent_Id = h.Actor_Agent_Id
    WHERE t.Org_Id = ? AND t.Is_Deleted = 'Y' AND h.Event_Name = 'TICKET_DELETED'`;

/** GET /tickets/recycle-bin - newest delete first, with when each is purged. */
const listRecycleBin = () => {
    const org = organizationService.getDefaultOrganization();
    const now = Date.now();
    const rows = getDB().prepare(`${IN_BIN_SQL} ORDER BY h.Event_Time DESC`).all(org.Organization_Id);
    return {
        retentionDays: env.recycleBinDays,
        tickets: rows.map((row) => {
            const purgeTime = purgeTimeOf(row.Deleted_Time);
            return {
                ...row,
                Purge_Time: purgeTime,
                Days_Left: Math.max(0, Math.ceil((new Date(purgeTime).getTime() - now) / DAY_MS))
            };
        })
    };
};

/** POST /tickets/:ticketId/restore - back on every list, as it was when deleted. */
const restoreTicket = (ticketId, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const ticket = ticketRepository.findById(ticketId, { includeDeleted: true });
    const latest = ticket && ticket.Is_Deleted === "Y" ? ticketRepository.findLatestDeleteEvent(ticketId) : null;
    if (!latest || latest.Event_Name !== TICKET_HISTORY_EVENT.TICKET_DELETED) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.TICKET_NOT_FOUND, "This ticket is not in the recycle bin");
    }
    if (new Date(purgeTimeOf(latest.Event_Time)).getTime() <= Date.now()) {
        throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.RESTORE_PERIOD_EXPIRED, `This ticket was deleted more than ${env.recycleBinDays} days ago and can no longer be restored`);
    }
    getDB().transaction(() => {
        ticketRepository.undeleteById(ticketId, actorAgentId);
        recordHistory({ ticketId, eventName: TICKET_HISTORY_EVENT.TICKET_RESTORED, actorAgentId, orgId: org.Organization_Id });
    })();
    // Lists treat it like a new ticket appearing.
    publish({ type: REALTIME_EVENT.TICKET_CREATED, ticketId, reason: "restored", actorAgentId });
    return { restored: true, ticketId };
};

// Child tables in foreign-key order (rows pointing at others go first).
// _GMAIL_INGESTED_MESSAGE is handled by markTicketPurged before these.
const CHILD_TABLES = [
    DB_TABLES.ASSIGNMENT_STATE_LOG,
    DB_TABLES.ASSIGNMENT_DEPENDENCY,
    DB_TABLES.TICKET_WORKLOG,
    DB_TABLES.TICKET_ASSIGNMENT,
    DB_TABLES.TICKET_REOPEN,
    DB_TABLES.TICKET_ATTACHMENT,
    DB_TABLES.TICKET_THREAD,
    DB_TABLES.TICKET_CONVERSATION,
    DB_TABLES.TICKET_COMMENT,
    DB_TABLES.TICKET_HISTORY,
    DB_TABLES.TICKET_METRICS,
    DB_TABLES.TICKET_CLOCK_SEGMENT,
    DB_TABLES.TICKET_ESCALATION,
    DB_TABLES.HOLIDAY_WORK
];

/** Permanently deletes one ticket and everything under it. Returns its attachment files. */
const purgeTicket = (db, ticket) => {
    const files = db.prepare(`SELECT Storage_Path FROM ${DB_TABLES.TICKET_ATTACHMENT} WHERE Ticket_Id = ?`)
        .all(ticket.Ticket_Id).map((row) => row.Storage_Path);
    db.transaction(() => {
        // Its mails stay in Gmail - remember their ids so the sync never imports them again.
        gmailIngestedMessageRepository.markTicketPurged(ticket.Ticket_Id, ticket.Ticket_Number);
        // A ticket split off this one keeps living; it just loses the link back.
        db.prepare(`UPDATE ${DB_TABLES.TICKET} SET Split_From_Ticket_Id = NULL WHERE Split_From_Ticket_Id = ?`).run(ticket.Ticket_Id);
        for (const table of CHILD_TABLES) {
            db.prepare(`DELETE FROM ${table} WHERE Ticket_Id = ?`).run(ticket.Ticket_Id);
        }
        db.prepare(`DELETE FROM ${DB_TABLES.TICKET} WHERE Ticket_Id = ?`).run(ticket.Ticket_Id);
    })();
    return files;
};

const removeFiles = (storagePaths) => {
    const dirs = new Set();
    for (const storagePath of storagePaths) {
        const absolute = resolveAttachmentPath(storagePath);
        try {
            fs.rmSync(absolute, { force: true });
            dirs.add(path.dirname(absolute));
        } catch (error) {
            logger.warn(`Recycle bin: could not delete file ${storagePath}: ${error.message}`);
        }
    }
    // The ticket's folder goes too once empty (a split child may still use files in it).
    for (const dir of dirs) {
        try {
            if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
        } catch {
            // already gone
        }
    }
};

/**
 * Permanently deletes every ticket that has been in the recycle bin longer
 * than RECYCLE_BIN_DAYS. Each ticket is its own transaction, so one failure
 * doesn't block the rest. Run by jobs/recycle-bin-purge.job.js.
 */
const purgeExpired = () => {
    const org = organizationService.getDefaultOrganization();
    const db = getDB();
    const cutoff = toIst(new Date(Date.now() - env.recycleBinDays * DAY_MS));
    const expired = db.prepare(`${IN_BIN_SQL} AND h.Event_Time <= ?`).all(org.Organization_Id, cutoff);
    const purged = [];
    for (const ticket of expired) {
        try {
            const files = purgeTicket(db, ticket);
            removeFiles(files);
            purged.push(ticket.Ticket_Id);
            logger.info(`Recycle bin: permanently deleted ticket #${ticket.Ticket_Number} (deleted ${ticket.Deleted_Time} by ${ticket.Deleted_By_Name || ticket.Deleted_By})`);
        } catch (error) {
            logger.error(`Recycle bin: purge of ticket #${ticket.Ticket_Number} failed:`, error);
        }
    }
    if (purged.length > 0) {
        publish({ type: REALTIME_EVENT.TICKET_DELETED, ticketIds: purged, reason: "purged" });
    }
    return { purged: purged.length };
};

module.exports = { listRecycleBin, restoreTicket, purgeExpired };
