const TICKET_COLUMNS = [
    "Ticket_Id", "Ticket_Number", "Subject", "Description", "Status", "Status_Type",
    "Priority", "Classification", "Category", "Sub_Category", "Channel",
    "Channel_Code", "Language", "Sentiment", "Relationship_Type", "Department_Id",
    "Bank_Id", "Contact_Id", "Account_Id", "Product_Id",
    "Contract_Id", "Layout_Id", "Sla_Policy_Id", "Blueprint_Id",
    "Response_Due_Date", "Closed_Time", "Clock_State", "Resolution_Started_Time", "Resolved_Time", "Onhold_Time", "Customer_Response_Time",
    "Resolution_Summary", "Is_OverDue", "Is_Response_Overdue", "Is_Escalated",
    "Is_Archived", "Is_Spam", "Is_Trashed", "Thread_Count", "Comment_Count",
    "Follower_Count", "Tag_Count", "Attachment_Count", "Task_Count",
    "Time_Entry_Count", "Approval_Count", "Is_Read", "Is_Following",
    "Has_Scheduled_Reply", "Created_By", "Created_Time", "Modified_By", "Modified_Time", "Org_Id"
];

const TICKET_CONVERSATION_COLUMNS = [
    "Conversation_Id", "Ticket_Id", "Direction", "Channel", "Content", "Content_Html",
    "Author_Contact_Id", "Author_Agent_Id", "Is_Public", "Is_Draft", "Is_Forward",
    "To_Address", "Cc_Address", "Sent_Time", "Created_By", "Modified_By",
    "Modified_Time", "Org_Id"
];

const TICKET_THREAD_COLUMNS = [
    "Thread_Id", "Ticket_Id", "Conversation_Id", "Message_Id_Header",
    "In_Reply_To_Header", "Channel", "Direction", "Created_By", "Modified_By",
    "Modified_Time", "Org_Id"
];

const TICKET_COMMENT_COLUMNS = [
    "Comment_Id", "Ticket_Id", "Commenter_Agent_Id", "Content", "Assignment_Id", "Commented_Time",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const TICKET_HISTORY_COLUMNS = [
    "History_Id", "Ticket_Id", "Event_Name", "Field_Name", "Old_Value",
    "New_Value", "Actor_Agent_Id", "Event_Time", "Created_By", "Modified_By",
    "Modified_Time", "Org_Id"
];

const TICKET_RESOLUTION_COLUMNS = [
    "Resolution_Id", "Ticket_Id", "Author_Agent_Id", "Content",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const TICKET_METRICS_COLUMNS = [
    "Metric_Id", "Ticket_Id", "First_Response_Time_Mins", "Total_Response_Time_Mins",
    "Resolution_Time_Mins", "Reopen_Count", "Reassign_Count", "Response_Count",
    "Handled_By_Agent_Ids", "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const TICKET_CLOCK_SEGMENT_COLUMNS = [
    "Segment_Id", "Ticket_Id", "Started_Time", "Ended_Time", "Status_At_Start",
    "Status_At_End", "Started_By", "Ended_By", "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const TICKET_ATTACHMENT_COLUMNS = [
    "Attachment_Id", "Ticket_Id", "Conversation_Id", "File_Name", "File_Size_Bytes",
    "Mime_Type", "Storage_Path", "Uploaded_By_Agent_Id", "Uploaded_Time",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const TAG_COLUMNS = [
    "Tag_Id", "Tag_Name", "Module", "Tag_Type", "Ticket_Count",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
];

const TICKET_TAG_MAP_COLUMNS = [
    "Ticket_Tag_Map_Id", "Ticket_Id", "Tag_Id", "Created_By", "Modified_By",
    "Modified_Time", "Org_Id"
];

const TICKET_ASSIGNMENT_COLUMNS = [
    "Assignment_Id", "Ticket_Id", "Agent_Id", "Department_Id", "Is_Cross_Team",
    "Assigned_By", "Assigned_Time", "Note", "Work_State", "Round_No", "Seen_Time", "Released_By", "Released_Time", "Org_Id"
];

module.exports = {
    TICKET_COLUMNS,
    TICKET_ASSIGNMENT_COLUMNS,
    TICKET_CONVERSATION_COLUMNS,
    TICKET_THREAD_COLUMNS,
    TICKET_COMMENT_COLUMNS,
    TICKET_HISTORY_COLUMNS,
    TICKET_RESOLUTION_COLUMNS,
    TICKET_METRICS_COLUMNS,
    TICKET_CLOCK_SEGMENT_COLUMNS,
    TICKET_ATTACHMENT_COLUMNS,
    TAG_COLUMNS,
    TICKET_TAG_MAP_COLUMNS
};
