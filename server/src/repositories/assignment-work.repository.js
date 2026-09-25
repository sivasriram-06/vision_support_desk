const { getDB } = require("../config/db");
const DB_TABLES = require("../constants/db-tables");

/**
 * State log, dependencies and work logs of assignments (0036). Raw SQL
 * rather than base.repository: these tables are append-mostly and have no
 * Modified_* columns.
 */

// --- HD_ASSIGNMENT_STATE_LOG ---------------------------------------------

const openStateLog = ({ stateLogId, assignmentId, ticketId, workState, startedTime, actorAgentId, note, orgId }) => {
    getDB().prepare(
        `INSERT INTO ${DB_TABLES.ASSIGNMENT_STATE_LOG}
            (State_Log_Id, Assignment_Id, Ticket_Id, Work_State, Started_Time, Actor_Agent_Id, Note, Org_Id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(stateLogId, assignmentId, ticketId, workState, startedTime, actorAgentId || null, note || null, orgId);
};

const closeOpenStateLog = (assignmentId, endedTime) => {
    getDB().prepare(
        `UPDATE ${DB_TABLES.ASSIGNMENT_STATE_LOG} SET Ended_Time = ? WHERE Assignment_Id = ? AND Ended_Time IS NULL`
    ).run(endedTime, assignmentId);
};

const findStateLogsByTicketId = (ticketId) =>
    getDB().prepare(
        `SELECT * FROM ${DB_TABLES.ASSIGNMENT_STATE_LOG} WHERE Ticket_Id = ? ORDER BY Started_Time ASC`
    ).all(ticketId);

// --- HD_ASSIGNMENT_DEPENDENCY --------------------------------------------

const insertDependency = ({ dependencyId, ticketId, assignmentId, dependsOnAssignmentId, createdBy, createdTime, orgId }) => {
    getDB().prepare(
        `INSERT INTO ${DB_TABLES.ASSIGNMENT_DEPENDENCY}
            (Dependency_Id, Ticket_Id, Assignment_Id, Depends_On_Assignment_Id, Created_By, Created_Time, Org_Id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(dependencyId, ticketId, assignmentId, dependsOnAssignmentId, createdBy || null, createdTime, orgId);
};

const deleteDependency = (assignmentId, dependsOnAssignmentId) =>
    getDB().prepare(
        `DELETE FROM ${DB_TABLES.ASSIGNMENT_DEPENDENCY} WHERE Assignment_Id = ? AND Depends_On_Assignment_Id = ?`
    ).run(assignmentId, dependsOnAssignmentId).changes;

const findDependenciesByTicketId = (ticketId) =>
    getDB().prepare(`SELECT * FROM ${DB_TABLES.ASSIGNMENT_DEPENDENCY} WHERE Ticket_Id = ?`).all(ticketId);

/** Assignments that wait on `assignmentId`. */
const findDependents = (assignmentId) =>
    getDB().prepare(
        `SELECT Assignment_Id FROM ${DB_TABLES.ASSIGNMENT_DEPENDENCY} WHERE Depends_On_Assignment_Id = ?`
    ).all(assignmentId).map((row) => row.Assignment_Id);

/** Blockers of `assignmentId` that are still open and not DONE. */
const findOpenBlockers = (assignmentId) =>
    getDB().prepare(
        `SELECT b.* FROM ${DB_TABLES.ASSIGNMENT_DEPENDENCY} dep
         JOIN ${DB_TABLES.TICKET_ASSIGNMENT} b ON b.Assignment_Id = dep.Depends_On_Assignment_Id
         WHERE dep.Assignment_Id = ? AND b.Released_Time IS NULL AND b.Work_State <> 'DONE'`
    ).all(assignmentId);

// --- HD_TICKET_WORKLOG ---------------------------------------------------

const insertWorklog = (row) => {
    getDB().prepare(
        `INSERT INTO ${DB_TABLES.TICKET_WORKLOG}
            (Worklog_Id, Ticket_Id, Assignment_Id, Agent_Id, Minutes, Work_Date, Note, Logged_By, Logged_Time, Org_Id)
         VALUES (@Worklog_Id, @Ticket_Id, @Assignment_Id, @Agent_Id, @Minutes, @Work_Date, @Note, @Logged_By, @Logged_Time, @Org_Id)`
    ).run(row);
};

const findWorklogById = (worklogId) =>
    getDB().prepare(`SELECT * FROM ${DB_TABLES.TICKET_WORKLOG} WHERE Worklog_Id = ? AND Is_Deleted = 'N'`).get(worklogId);

const softDeleteWorklog = (worklogId) =>
    getDB().prepare(`UPDATE ${DB_TABLES.TICKET_WORKLOG} SET Is_Deleted = 'Y' WHERE Worklog_Id = ?`).run(worklogId);

const findWorklogsByTicketId = (ticketId) =>
    getDB().prepare(
        `SELECT w.*, a.First_Name, a.Last_Name
         FROM ${DB_TABLES.TICKET_WORKLOG} w
         JOIN ${DB_TABLES.AGENT} a ON a.Agent_Id = w.Agent_Id
         WHERE w.Ticket_Id = ? AND w.Is_Deleted = 'N'
         ORDER BY w.Logged_Time ASC`
    ).all(ticketId);

/** Demo seed: wipe a ticket's work tracking before rewriting its timeline. */
const deleteByTicketId = (ticketId) => {
    const db = getDB();
    db.prepare(`DELETE FROM ${DB_TABLES.ASSIGNMENT_STATE_LOG} WHERE Ticket_Id = ?`).run(ticketId);
    db.prepare(`DELETE FROM ${DB_TABLES.ASSIGNMENT_DEPENDENCY} WHERE Ticket_Id = ?`).run(ticketId);
    db.prepare(`DELETE FROM ${DB_TABLES.TICKET_WORKLOG} WHERE Ticket_Id = ?`).run(ticketId);
};

module.exports = {
    openStateLog,
    closeOpenStateLog,
    findStateLogsByTicketId,
    insertDependency,
    deleteDependency,
    findDependenciesByTicketId,
    findDependents,
    findOpenBlockers,
    insertWorklog,
    findWorklogById,
    softDeleteWorklog,
    findWorklogsByTicketId,
    deleteByTicketId
};
