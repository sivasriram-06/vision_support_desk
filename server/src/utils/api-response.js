/**
 * Shapes success responses per the project's global API response contract
 * (docs/Zoho_Desk_UI_Module_API_Reference.docx, section 11).
 */

const ok = (res, status, data, meta = null) => {
    const body = { data };
    if (meta) {
        Object.assign(body, meta);
    }
    return res.status(status).json(body);
};

const okList = (res, status, data, paging) => {
    return res.status(status).json({ data, paging });
};

module.exports = {
    ok,
    okList
};
