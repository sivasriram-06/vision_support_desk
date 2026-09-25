const ESCALATION_LEVEL_COLUMNS = [
    "Escalation_Level_Id", "Priority", "Level_No", "Offset_Hours",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const TICKET_ESCALATION_COLUMNS = [
    "Ticket_Escalation_Id", "Ticket_Id", "Level_No", "Trigger_Time", "Org_Id"
];

module.exports = { ESCALATION_LEVEL_COLUMNS, TICKET_ESCALATION_COLUMNS };
