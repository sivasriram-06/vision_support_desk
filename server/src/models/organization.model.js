const ORGANIZATION_COLUMNS = [
    "Organization_Id", "Company_Name", "Description", "Portal_Name", "Portal_Url",
    "Custom_Domain", "Is_Domain_Mapped", "Alias", "Edition", "Support_Org_Type",
    "Industry", "Employee_Count", "Employee_Count_Range", "Country", "State",
    "City", "Street", "Zip_Code", "Phone_Number", "Mobile", "Fax", "Website",
    "Primary_Contact_Email", "Currency_Code", "Currency_Symbol", "Currency_Locale",
    "Time_Zone", "Logo_Url", "Favicon_Url", "Is_Sandbox_Portal", "Is_Default_Portal",
    "Created_By", "Modified_By", "Modified_Time"
];

const DEPARTMENT_COLUMNS = [
    "Department_Id", "Department_Name", "Sanitized_Name", "Description",
    "Name_In_Customer_Portal", "Creator_Agent_Id", "Is_Default", "Is_Enabled",
    "Is_Visible_To_Contacts", "Is_Team_Assignment_Enabled", "Has_Logo",
    "Chat_Status", "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const TEAM_COLUMNS = [
    "Team_Id", "Team_Name", "Department_Id", "Logo_Path",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const CHANNEL_COLUMNS = [
    "Channel_Id", "Channel_Name", "Channel_Type", "Department_Id",
    "Is_Reply_Enabled", "Is_Active", "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const MAIL_REPLY_ADDRESS_COLUMNS = [
    "Mail_Reply_Address_Id", "Department_Id", "Display_Name", "Email_Address",
    "Is_Verified", "Smtp_Config_Json", "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

module.exports = {
    ORGANIZATION_COLUMNS,
    DEPARTMENT_COLUMNS,
    TEAM_COLUMNS,
    CHANNEL_COLUMNS,
    MAIL_REPLY_ADDRESS_COLUMNS
};
