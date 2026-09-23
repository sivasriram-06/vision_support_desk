-- Status needs one more piece of metadata than a plain picklist value: which
-- fixed bucket (Open/On Hold/Closed) it counts as, since that bucket is what
-- actually drives SLA-overdue, ticket ageing, and auto Closed_Time. Tagged
-- once per Status value here in Config, so agents only ever pick the single
-- Status field on a ticket and the bucket resolves automatically - same
-- column-per-field pattern as Category's Parent_Value.
ALTER TABLE HD_PICKLIST_VALUE ADD COLUMN Status_Type TEXT CHECK (Status_Type IS NULL OR Status_Type IN ('Open', 'On Hold', 'Closed'));
