const { getDB } = require("../config/db");
const DB_TABLES = require("../constants/db-tables");
const { parsePagination } = require("../utils/pagination");

/**
 * Customers = HD_CONTACT_MASTER rows (every Gmail From address) with
 * their bank and ticket counts. Open / closed use
 * the ticket's Status_Type; overdue = not closed and past its SLA due date
 * (ISO-8601 UTC, so text comparison orders correctly).
 */

const NAME_SQL = "TRIM(COALESCE(c.First_Name || ' ', '') || COALESCE(c.Last_Name, ''))";

const SELECT_SQL = `
    SELECT
        c.Contact_Id, c.First_Name, c.Last_Name, ${NAME_SQL} AS Full_Name, c.Email, c.Created_Time,
        c.Bank_Id, b.Bank_Name,
        COUNT(t.Ticket_Id) AS Total_Tickets,
        COALESCE(SUM(CASE WHEN t.Ticket_Id IS NOT NULL AND t.Status_Type <> 'Closed' THEN 1 ELSE 0 END), 0) AS Open_Tickets,
        COALESCE(SUM(CASE WHEN t.Status_Type = 'Closed' THEN 1 ELSE 0 END), 0) AS Closed_Tickets,
        COALESCE(SUM(CASE WHEN t.Status_Type <> 'Closed' AND t.Response_Due_Date < @now THEN 1 ELSE 0 END), 0) AS Overdue_Tickets
    FROM ${DB_TABLES.CONTACT} c
    LEFT JOIN ${DB_TABLES.BANK} b ON b.Bank_Id = c.Bank_Id
    LEFT JOIN ${DB_TABLES.TICKET} t ON t.Contact_Id = c.Contact_Id AND t.Is_Deleted = 'N'
`;

const buildWhere = (orgId, query) => {
    const params = { orgId, now: new Date().toISOString() };
    let where = "c.Org_Id = @orgId AND c.Is_Deleted = 'N'";

    if (query.search) {
        where += ` AND (c.Email LIKE @search OR ${NAME_SQL} LIKE @search)`;
        params.search = `%${query.search}%`;
    }
    // A-Z bar: first letter of the name; "#" = anything not starting A-Z.
    if (query.letter === "#") {
        where += ` AND UPPER(SUBSTR(${NAME_SQL}, 1, 1)) NOT BETWEEN 'A' AND 'Z'`;
    } else if (query.letter) {
        where += ` AND UPPER(SUBSTR(${NAME_SQL}, 1, 1)) = @letter`;
        params.letter = query.letter.toUpperCase();
    }
    if (query.bankId === "none") {
        where += " AND c.Bank_Id IS NULL";
    } else if (query.bankId) {
        where += " AND c.Bank_Id = @bankId";
        params.bankId = query.bankId;
    }
    return { where, params };
};

const findAll = (orgId, query = {}) => {
    const db = getDB();
    const { limit, offset, page } = parsePagination(query);
    const { where, params } = buildWhere(orgId, query);

    const rows = db.prepare(
        `${SELECT_SQL} WHERE ${where} GROUP BY c.Contact_Id ORDER BY Full_Name COLLATE NOCASE, c.Email LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit, offset });

    const total = db.prepare(
        `SELECT COUNT(*) AS total FROM ${DB_TABLES.CONTACT} c WHERE ${where}`
    ).get(params).total;

    return { rows, total, page, limit };
};

const findById = (contactId) => {
    const db = getDB();
    return db.prepare(
        `${SELECT_SQL} WHERE c.Contact_Id = @contactId AND c.Is_Deleted = 'N' GROUP BY c.Contact_Id`
    ).get({ contactId, now: new Date().toISOString() });
};


module.exports = { findAll, findById };
