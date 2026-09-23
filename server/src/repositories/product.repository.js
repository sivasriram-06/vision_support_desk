const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { PRODUCT_COLUMNS } = require("../models/product.model");

const base = createRepository({
    table: DB_TABLES.PRODUCT,
    primaryKey: "Product_Id",
    columns: PRODUCT_COLUMNS
});

const findAll = (orgId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.PRODUCT} WHERE Org_Id = ? AND Is_Deleted = 'N' ORDER BY Product_Name ASC`
    ).all(orgId);
};

const findByName = (orgId, productName) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.PRODUCT} WHERE Org_Id = ? AND Product_Name = ? AND Is_Deleted = 'N'`
    ).get(orgId, productName);
};

module.exports = { ...base, findAll, findByName };
