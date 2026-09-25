const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { TICKET_ASSIGNMENT_COLUMNS } = require("../models/ticket.model");

// HD_TICKET_ASSIGNMENT has no Is_Deleted/Modified_* columns (rows are
// released, never deleted), so it doesn't use the base soft-delete helpers.
const base = createRepository({
    table: DB_TABLES.TICKET_ASSIGNMENT,
    primaryKey: "Assignment_Id",
    columns: TICKET_ASSIGNMENT_COLUMNS
});

const insert = base.insert;

const ASSIGNMENT_SELECT = `
    SELECT asg.*,
        a.First_Name, a.Last_Name, a.Email,
        d.Department_Name, d.Team_Type,
        ab.First_Name AS Assigned_By_First_Name, ab.Last_Name AS Assigned_By_Last_Name,
        rb.First_Name AS Released_By_First_Name, rb.Last_Name AS Released_By_Last_Name
    FROM ${DB_TABLES.TICKET_ASSIGNMENT} asg
    JOIN ${DB_TABLES.AGENT} a ON a.Agent_Id = asg.Agent_Id
    LEFT JOIN ${DB_TABLES.DEPARTMENT} d ON d.Department_Id = asg.Department_Id
    LEFT JOIN ${DB_TABLES.AGENT} ab ON ab.Agent_Id = asg.Assigned_By
    LEFT JOIN ${DB_TABLES.AGENT} rb ON rb.Agent_Id = asg.Released_By
`;

/** Every assignment a ticket has had, current and released, oldest first. */
const findByTicketId = (ticketId) => {
    const db = getDB();
    return db.prepare(`${ASSIGNMENT_SELECT} WHERE asg.Ticket_Id = ? ORDER BY asg.Assigned_Time ASC`).all(ticketId);
};

const findById = (assignmentId) => {
    const db = getDB();
    return db.prepare(`${ASSIGNMENT_SELECT} WHERE asg.Assignment_Id = ?`).get(assignmentId);
};

/** Columns this repository may change on an assignment (no Modified_* columns on this table). */
const updateWork = (assignmentId, { workState, roundNo }) => {
    const db = getDB();
    if (workState !== undefined) {
        db.prepare(`UPDATE ${DB_TABLES.TICKET_ASSIGNMENT} SET Work_State = ? WHERE Assignment_Id = ?`).run(workState, assignmentId);
    }
    if (roundNo !== undefined) {
        db.prepare(`UPDATE ${DB_TABLES.TICKET_ASSIGNMENT} SET Round_No = ? WHERE Assignment_Id = ?`).run(roundNo, assignmentId);
    }
};

/** How many times this team has already been on the ticket (for Round_No). */
const countTeamRounds = (ticketId, departmentId) => {
    const db = getDB();
    return db.prepare(
        `SELECT COUNT(DISTINCT Round_No) AS total FROM ${DB_TABLES.TICKET_ASSIGNMENT} WHERE Ticket_Id = ? AND Department_Id IS ?`
    ).get(ticketId, departmentId).total;
};

/** Is someone from this team currently on the ticket? Then a new member joins the same round. */
const findOpenTeamRound = (ticketId, departmentId) => {
    const db = getDB();
    return db.prepare(
        `SELECT MAX(Round_No) AS roundNo FROM ${DB_TABLES.TICKET_ASSIGNMENT}
         WHERE Ticket_Id = ? AND Department_Id IS ? AND Released_Time IS NULL`
    ).get(ticketId, departmentId).roundNo;
};

const findOpen = (ticketId, agentId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_ASSIGNMENT} WHERE Ticket_Id = ? AND Agent_Id = ? AND Released_Time IS NULL`
    ).get(ticketId, agentId);
};

const countOpen = (ticketId) => {
    const db = getDB();
    return db.prepare(
        `SELECT COUNT(*) AS total FROM ${DB_TABLES.TICKET_ASSIGNMENT} WHERE Ticket_Id = ? AND Released_Time IS NULL`
    ).get(ticketId).total;
};

const release = (assignmentId, releasedBy, releasedTime) => {
    const db = getDB();
    db.prepare(
        `UPDATE ${DB_TABLES.TICKET_ASSIGNMENT} SET Released_By = ?, Released_Time = ? WHERE Assignment_Id = ?`
    ).run(releasedBy, releasedTime, assignmentId);
};

/** The assignee opened the ticket: clears the "new" flag on My Tickets. */
const markSeen = (ticketId, agentId, seenTime) => {
    const db = getDB();
    return db.prepare(
        `UPDATE ${DB_TABLES.TICKET_ASSIGNMENT} SET Seen_Time = ?
         WHERE Ticket_Id = ? AND Agent_Id = ? AND Released_Time IS NULL AND Seen_Time IS NULL`
    ).run(seenTime, ticketId, agentId).changes;
};

/** Demo seed: wipe a ticket's assignments before rewriting its timeline. */
const deleteByTicketId = (ticketId) => {
    const db = getDB();
    db.prepare(`DELETE FROM ${DB_TABLES.TICKET_ASSIGNMENT} WHERE Ticket_Id = ?`).run(ticketId);
};

/** Current assignees who haven't finished (anything but DONE) - blocks resolving the ticket. */
const findOpenUnfinished = (ticketId) => {
    const db = getDB();
    return db.prepare(
        `${ASSIGNMENT_SELECT} WHERE asg.Ticket_Id = ? AND asg.Released_Time IS NULL AND asg.Work_State <> 'DONE'`
    ).all(ticketId);
};

module.exports = {
    insert,
    findById,
    findByTicketId,
    findOpen,
    findOpenUnfinished,
    countOpen,
    countTeamRounds,
    findOpenTeamRound,
    updateWork,
    release,
    markSeen,
    deleteByTicketId
};
