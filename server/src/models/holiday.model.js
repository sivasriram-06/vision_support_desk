const HOLIDAY_COLUMNS = [
    "Holiday_Id", "Holiday_Date", "Holiday_Name",
    "Created_By", "Created_Time", "Modified_By", "Modified_Time", "Org_Id"
];

const HOLIDAY_WORK_COLUMNS = [
    "Holiday_Work_Id", "Ticket_Id", "Agent_Id", "Holiday_Date", "Started_Time", "Ended_Time", "Minutes",
    "Created_By", "Created_Time", "Modified_By", "Modified_Time", "Org_Id"
];

module.exports = { HOLIDAY_COLUMNS, HOLIDAY_WORK_COLUMNS };
