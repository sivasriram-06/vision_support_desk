const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { MAIL_REPLY_ADDRESS_COLUMNS } = require("../models/organization.model");

const base = createRepository({
    table: DB_TABLES.MAIL_REPLY_ADDRESS,
    primaryKey: "Mail_Reply_Address_Id",
    columns: MAIL_REPLY_ADDRESS_COLUMNS
});

const findByEmail = (email) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.MAIL_REPLY_ADDRESS} WHERE Email_Address = ? COLLATE NOCASE AND Is_Deleted = 'N'`
    ).get(email);
};

module.exports = { ...base, findByEmail };
