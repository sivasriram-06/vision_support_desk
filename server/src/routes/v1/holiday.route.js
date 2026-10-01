const express = require("express");
const requirePermission = require("../../middleware/authorize.middleware");
const validate = require("../../middleware/validate.middleware");
const { PERMISSIONS } = require("../../constants/permissions");
const holidayController = require("../../controllers/holiday.controller");
const {
    holidayIdParamSchema,
    listHolidaysQuerySchema,
    createHolidaySchema,
    updateHolidaySchema,
    impactQuerySchema,
    holidaySettingsSchema
} = require("../../schemas/holiday.schema");

// Company holiday calendar: Admin, Manager, Team Lead (holidays.manage).
const router = express.Router();
router.use(requirePermission(PERMISSIONS.HOLIDAYS_MANAGE));

router.get("/", validate(listHolidaysQuerySchema, "query"), holidayController.listHolidays);
router.get("/impact", validate(impactQuerySchema, "query"), holidayController.previewImpact);
router.put("/settings", validate(holidaySettingsSchema), holidayController.updateSettings);
router.post("/", validate(createHolidaySchema), holidayController.createHoliday);
router.patch("/:holidayId", validate(holidayIdParamSchema, "params"), validate(updateHolidaySchema), holidayController.updateHoliday);
router.delete("/:holidayId", validate(holidayIdParamSchema, "params"), holidayController.deleteHoliday);

module.exports = router;
