const ORGANIZATION_COLUMNS = [
    "Organization_Id", "Company_Name", "Created_By", "Modified_By", "Modified_Time"
];

const DEPARTMENT_COLUMNS = [
    "Department_Id", "Department_Name", "Sanitized_Name", "Team_Type", "Is_Default",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const BANK_COLUMNS = [
    "Bank_Id", "Bank_Name", "Department_Id",
    "Country", "Module", "Support_Level", "Working_Days", "Time_Zone", "Support_Start_Ist",
    "Support_End_Ist", "Is_24x7", "Remarks",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const BANK_RESOURCE_COLUMNS = [
    "Bank_Resource_Id", "Bank_Id", "Agent_Id", "Resource_Type",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const MAIL_REPLY_ADDRESS_COLUMNS = [
    "Mail_Reply_Address_Id", "Department_Id", "Email_Address",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

module.exports = {
    ORGANIZATION_COLUMNS,
    DEPARTMENT_COLUMNS,
    BANK_COLUMNS,
    BANK_RESOURCE_COLUMNS,
    MAIL_REPLY_ADDRESS_COLUMNS
};
