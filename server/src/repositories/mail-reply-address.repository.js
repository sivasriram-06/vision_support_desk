const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { CHANNEL_COLUMNS, MAIL_REPLY_ADDRESS_COLUMNS } = require("../models/organization.model");

const channelBase = createRepository({
    table: DB_TABLES.CHANNEL,
    primaryKey: "Channel_Id",
    columns: CHANNEL_COLUMNS
});

const findAllChannels = (orgId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.CHANNEL} WHERE Org_Id = ? AND Is_Deleted = 'N' ORDER BY Channel_Name ASC`
    ).all(orgId);
};

const mailReplyAddressBase = createRepository({
    table: DB_TABLES.MAIL_REPLY_ADDRESS,
    primaryKey: "Mail_Reply_Address_Id",
    columns: MAIL_REPLY_ADDRESS_COLUMNS
});

const findMailReplyAddressByEmail = (email) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.MAIL_REPLY_ADDRESS} WHERE Email_Address = ? AND Is_Deleted = 'N'`
    ).get(email);
};

module.exports = {
    channel: { ...channelBase, findAllChannels },
    mailReplyAddress: { ...mailReplyAddressBase, findMailReplyAddressByEmail }
};
