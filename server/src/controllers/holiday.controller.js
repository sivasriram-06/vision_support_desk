const holidayService = require("../services/holiday.service");
const getActorAgentId = require("../utils/get-actor");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const handle = (fn, status = HTTP_STATUS.OK) => (req, res, next) => {
    try {
        ok(res, status, fn(req));
    } catch (error) {
        next(error);
    }
};

module.exports = {
    listHolidays: handle((req) => holidayService.listHolidays({ year: req.query.year ? Number(req.query.year) : null })),
    previewImpact: handle((req) => holidayService.previewImpact({ date: req.query.date, remove: req.query.remove === "true" })),
    createHoliday: handle((req) => holidayService.createHoliday(req.body, getActorAgentId(req)), HTTP_STATUS.CREATED),
    updateHoliday: handle((req) => holidayService.updateHoliday(req.params.holidayId, req.body, getActorAgentId(req))),
    deleteHoliday: handle((req) => holidayService.deleteHoliday(req.params.holidayId, getActorAgentId(req))),
    updateSettings: handle((req) => holidayService.updateSettings(req.body, getActorAgentId(req)))
};
