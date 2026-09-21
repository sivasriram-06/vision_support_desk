const AGENT_COLUMNS = [
    "Agent_Id", "Zuid", "First_Name", "Last_Name", "Email", "Mobile", "Phone",
    "Extension", "Status", "Role_Id", "Profile_Id", "Role_Permission_Type",
    "Primary_Department_Id", "Timezone", "Language", "Country_Code", "Photo_Path",
    "About_Info", "Is_Confirmed", "Is_Zia_Agent", "Created_By", "Modified_By",
    "Modified_Time", "Org_Id"
];

const ROLE_COLUMNS = [
    "Role_Id", "Role_Name", "Parent_Role_Id", "Data_Sharing_Rule",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const PROFILE_COLUMNS = [
    "Profile_Id", "Profile_Name", "Description", "Profile_Type", "Is_Default",
    "Is_Visible", "Permissions_Json", "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const AGENT_AUTH_COLUMNS = [
    "Agent_Auth_Id", "Agent_Id", "Identity_Provider", "External_Subject",
    "Login_Email", "Is_Active", "Last_Login_Time", "Modified_Time",
    "Created_By", "Modified_By", "Org_Id"
];

const AGENT_SESSION_COLUMNS = [
    "Session_Id", "Agent_Id", "Session_Token_Hash", "Expires_Time",
    "Last_Activity_Time", "Revoked_Time", "Ip_Address", "User_Agent",
    "Csrf_Token_Hash", "Auth_Method", "Is_Active", "Created_By", "Modified_Time", "Org_Id"
];

const AUTH_LOGIN_EVENT_COLUMNS = [
    "Login_Event_Id", "Agent_Id", "Event_Type", "Auth_Method", "Identity_Provider",
    "Login_Email", "Failure_Code", "Ip_Address", "User_Agent", "Session_Id", "Org_Id"
];

module.exports = {
    AGENT_COLUMNS,
    ROLE_COLUMNS,
    PROFILE_COLUMNS,
    AGENT_AUTH_COLUMNS,
    AGENT_SESSION_COLUMNS,
    AUTH_LOGIN_EVENT_COLUMNS
};
