const TICKET_COLUMNS = [
    "Ticket_Id", "Ticket_Number", "Subject", "Description", "Status", "Status_Type",
    "Priority", "Classification", "Category", "Sub_Category", "Channel",
    "Department_Id", "Bank_Id", "Contact_Id", "Product_Id", "Split_From_Ticket_Id", "Sla_Start_Time",
    "Response_Due_Date", "Closed_Time", "Clock_State", "Resolution_Started_Time", "Resolved_Time",
    "Thread_Count", "Comment_Count", "Attachment_Count",
    "Created_By", "Created_Time", "Modified_By", "Modified_Time", "Org_Id"
];

const TICKET_CONVERSATION_COLUMNS = [
    "Conversation_Id", "Ticket_Id", "Direction", "Channel", "Subject", "Post_Close_Decision", "Content", "Content_Html",
    "Author_Contact_Id", "Author_Agent_Id", "Is_Public",
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

const TICKET_METRICS_COLUMNS = [
    "Metric_Id", "Ticket_Id", "Resolution_Time_Mins", "Reopen_Count",
    "Created_By", "Modified_By", "Modified_Time", "Org_Id"
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
    TICKET_METRICS_COLUMNS,
    TICKET_CLOCK_SEGMENT_COLUMNS,
    TICKET_ATTACHMENT_COLUMNS
};
