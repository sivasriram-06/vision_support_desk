-- Category is a sub-classification: many Categories belong to one
-- Classification (e.g. "Problem" -> Application/Process/People/...), and the
-- same Category text can legitimately repeat under different
-- Classifications (e.g. "Application" appears under both "Problem" and
-- "Incident") - see docs screenshot of the Ticket Type / Category table.
-- Parent_Value stores the owning Classification's plain Value text (not an
-- id), consistent with how the rest of this app links by text rather than
-- FK id (Priority, Status). NULL for non-Category rows (Classification,
-- Status, Sub_Category) and for any pre-existing Category rows.
ALTER TABLE HD_PICKLIST_VALUE ADD COLUMN Parent_Value TEXT;

CREATE INDEX IF NOT EXISTS idx_picklist_value_parent ON HD_PICKLIST_VALUE (Org_Id, Field, Parent_Value);

-- Replace the old (Org_Id, Field, Value) uniqueness with one that also
-- scopes by Parent_Value, using COALESCE so two NULL parents (every
-- non-Category row) still collide as before - only Category rows actually
-- differ per parent.
DROP INDEX IF EXISTS uq_picklist_value_org;
CREATE UNIQUE INDEX IF NOT EXISTS uq_picklist_value_org
    ON HD_PICKLIST_VALUE (Org_Id, Field, COALESCE(Parent_Value, ''), Value)
    WHERE Is_Deleted = 'N';
