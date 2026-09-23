-- HD_STATUS_MASTER (added in 0033) forced every custom Status to map to a
-- fixed Status_Type bucket via an admin "maps to" dropdown - turned out to
-- be unwanted complexity. Status is managed as a plain picklist instead now
-- (HD_PICKLIST_VALUE, field='STATUS'), same as Classification/Category, and
-- an agent sets the Open/On Hold/Closed bucket directly on the ticket.
-- Nothing references this table via FK, so it's a plain drop.
DROP TABLE IF EXISTS HD_STATUS_MASTER;
