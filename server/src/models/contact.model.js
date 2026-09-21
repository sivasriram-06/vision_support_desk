const CONTACT_COLUMNS = [
    "Contact_Id", "First_Name", "Last_Name", "Email", "Secondary_Email", "Phone",
    "Mobile", "Title", "Twitter", "Facebook", "Street", "City", "State", "Zip",
    "Country", "Description", "Language", "Contact_Type", "Account_Id",
    "Owner_Agent_Id", "Photo_Url", "Is_Anonymous", "Is_End_User", "Is_Spam",
    "External_Crm_Contact_Id", "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const ACCOUNT_COLUMNS = [
    "Account_Id", "Account_Name", "Email", "Phone", "Website", "Fax", "Industry",
    "Annual_Revenue", "Street", "City", "State", "Zip_Code", "Country",
    "Description", "Owner_Agent_Id", "External_Crm_Account_Id",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const CONTACT_ACCOUNT_MAP_COLUMNS = [
    "Contact_Account_Id", "Contact_Id", "Account_Id", "Is_Primary",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const CUSTOMER_HAPPINESS_COLUMNS = [
    "Happiness_Id", "Contact_Id", "Bad_Percentage", "Ok_Percentage",
    "Good_Percentage", "Last_Calculated_Time", "Created_By", "Modified_By",
    "Modified_Time", "Org_Id"
];

module.exports = {
    CONTACT_COLUMNS,
    ACCOUNT_COLUMNS,
    CONTACT_ACCOUNT_MAP_COLUMNS,
    CUSTOMER_HAPPINESS_COLUMNS
};
