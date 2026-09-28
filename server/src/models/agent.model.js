const AGENT_COLUMNS = [
    "Agent_Id", "First_Name", "Last_Name", "Email", "Status", "Role_Id",
    "Primary_Department_Id", "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const ROLE_COLUMNS = [
    "Role_Id", "Role_Name", "Role_Key", "Permissions_Json", "Sort_Order",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const AGENT_CREDENTIAL_COLUMNS = [
    "Agent_Credential_Id", "Agent_Id", "Password_Hash", "Must_Change_Password",
    "Password_Changed_Time", "Failed_Login_Count", "Locked_Until", "Last_Login_Time",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

module.exports = { AGENT_COLUMNS, ROLE_COLUMNS, AGENT_CREDENTIAL_COLUMNS };
