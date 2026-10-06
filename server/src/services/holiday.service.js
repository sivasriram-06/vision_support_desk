const { getDB } = require("../config/db");
const holidayRepository = require("../repositories/holiday.repository");
const appSettingRepository = require("../repositories/app-setting.repository");
const ticketRepository = require("../repositories/ticket.repository");
const bankRepository = require("../repositories/bank.repository");
const { metrics: metricsRepository } = require("../repositories/history.repository");
const organizationService = require("./organization.service");
const holidayCalendar = require("./sla/holiday-calendar");
const { computeSlaDueDate } = require("./sla/sla.service");
const escalationService = require("./sla/escalation.service");
const { computeResolutionMinutes, calendarForBankId } = require("./sla/resolution-clock.service");
const { publish, REALTIME_EVENT } = require("../realtime/bus");
const generateId = require("../utils/generate-id");
const DB_TABLES = require("../constants/db-tables");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { DateTime } = require("luxon");
const { IST_ZONE } = require("../utils/time");

// Company holidays (one per IST date): every change re-dates open SLAs and recomputes closed resolution times.

const badRequest = (message) => new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, message);
const weekdayOf = (date) => DateTime.fromISO(date, { zone: IST_ZONE }).toFormat("cccc");
const toDto = (h) => ({ ...h, Weekday: weekdayOf(h.Holiday_Date) });

const assertValidDate = (date) => {
    const dt = DateTime.fromISO(date || "", { zone: IST_ZONE });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !dt.isValid) throw badRequest("Give the holiday date as YYYY-MM-DD");
};

const listHolidays = ({ year } = {}) => {
    const org = organizationService.getDefaultOrganization();
    return {
        holidays: holidayRepository.findAll(org.Organization_Id, { year: year || null }).map(toDto),
        years: holidayRepository.findYears(org.Organization_Id),
        settings: getSettings()
    };
};

const getSettings = () => {
    const org = organizationService.getDefaultOrganization();
    return { applyTo24x7: appSettingRepository.get(org.Organization_Id, holidayCalendar.SETTING_APPLY_TO_24X7) === "Y" };
};

// Re-dates open SLAs and closed resolution times on the current holidays; returns moved tickets.
const recalculate = (actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const orgId = org.Organization_Id;
    holidayCalendar.invalidate();
    const moved = [];
    getDB().transaction(() => {
        for (const t of ticketRepository.findOpenWithPriority(orgId)) {
            const dueDate = computeSlaDueDate({ createdTime: t.Sla_Start_Time || t.Created_Time, priority: t.Priority, bankId: t.Bank_Id, orgId });
            if (dueDate === t.Response_Due_Date) continue;
            ticketRepository.updateById(t.Ticket_Id, { Response_Due_Date: dueDate, Modified_By: actorAgentId });
            escalationService.rebuildTriggers({ ...t, Response_Due_Date: dueDate }, orgId);
            moved.push({ ticketId: t.Ticket_Id, ticketNumber: t.Ticket_Number, from: t.Response_Due_Date, to: dueDate });
        }
        for (const t of ticketRepository.findStopped(orgId)) {
            const metrics = metricsRepository.findMetricsByTicketId(t.Ticket_Id);
            if (!metrics) continue;
            const minutes = computeResolutionMinutes(t.Ticket_Id, calendarForBankId(t.Bank_Id));
            if (minutes !== metrics.Resolution_Time_Mins) {
                metricsRepository.updateById(metrics.Metric_Id, { Resolution_Time_Mins: minutes, Modified_By: actorAgentId });
            }
        }
    })();
    for (const m of moved) publish({ type: REALTIME_EVENT.TICKET_CHANGED, ticketId: m.ticketId, reason: "holiday", actorAgentId });
    publish({ type: REALTIME_EVENT.ESCALATION_CHANGED, ticketIds: moved.map((m) => m.ticketId), reason: "holiday" });
    return moved;
};

// Read-only: open tickets whose SLA due date would move if `date` became (or stopped being) a holiday.
const previewImpact = ({ date, remove = false }) => {
    assertValidDate(date);
    const org = organizationService.getDefaultOrganization();
    const orgId = org.Organization_Id;
    const current = holidayCalendar.getCompanyHolidays();
    const dates = new Set(current.dates);
    if (remove) dates.delete(date);
    else dates.add(date);
    const { setHolidayProvider } = require("./sla/business-calendar");
    const affected = [];
    try {
        setHolidayProvider(() => ({ ...current, dates }));
        for (const t of ticketRepository.findOpenWithPriority(orgId)) {
            const dueDate = computeSlaDueDate({ createdTime: t.Sla_Start_Time || t.Created_Time, priority: t.Priority, bankId: t.Bank_Id, orgId });
            if (dueDate !== t.Response_Due_Date) {
                affected.push({ ticketId: t.Ticket_Id, ticketNumber: t.Ticket_Number, bankName: t.Bank_Id ? bankRepository.findById(t.Bank_Id)?.Bank_Name : null, from: t.Response_Due_Date, to: dueDate });
            }
        }
    } finally {
        setHolidayProvider(holidayCalendar.getCompanyHolidays);
    }
    return { date, affected };
};

const createHoliday = ({ holidayDate, holidayName }, actorAgentId) => {
    assertValidDate(holidayDate);
    const org = organizationService.getDefaultOrganization();
    if (holidayRepository.findByDate(org.Organization_Id, holidayDate)) throw badRequest(`${holidayDate} is already a holiday`);
    const id = generateId(DB_TABLES.HOLIDAY);
    holidayRepository.insert({
        Holiday_Id: id,
        Holiday_Date: holidayDate,
        Holiday_Name: holidayName.trim(),
        Created_By: actorAgentId,
        Org_Id: org.Organization_Id
    });
    const moved = recalculate(actorAgentId);
    return { holiday: toDto(holidayRepository.findById(id)), ticketsMoved: moved.length };
};

const getHoliday = (holidayId) => {
    const holiday = holidayRepository.findById(holidayId);
    if (!holiday) throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.VALIDATION_ERROR, "Holiday not found");
    return holiday;
};

const updateHoliday = (holidayId, { holidayDate, holidayName }, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const holiday = getHoliday(holidayId);
    const changes = { Modified_By: actorAgentId };
    if (holidayName !== undefined) changes.Holiday_Name = holidayName.trim();
    if (holidayDate !== undefined && holidayDate !== holiday.Holiday_Date) {
        assertValidDate(holidayDate);
        if (holidayRepository.findByDate(org.Organization_Id, holidayDate)) throw badRequest(`${holidayDate} is already a holiday`);
        changes.Holiday_Date = holidayDate;
    }
    holidayRepository.updateById(holidayId, changes);
    const moved = changes.Holiday_Date ? recalculate(actorAgentId) : [];
    return { holiday: toDto(holidayRepository.findById(holidayId)), ticketsMoved: moved.length };
};

const deleteHoliday = (holidayId, actorAgentId) => {
    getHoliday(holidayId);
    holidayRepository.softDeleteById(holidayId, actorAgentId);
    const moved = recalculate(actorAgentId);
    return { deleted: true, ticketsMoved: moved.length };
};

const updateSettings = ({ applyTo24x7 }, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    appSettingRepository.set(org.Organization_Id, holidayCalendar.SETTING_APPLY_TO_24X7, applyTo24x7 ? "Y" : "N", actorAgentId);
    const moved = recalculate(actorAgentId);
    return { settings: getSettings(), ticketsMoved: moved.length };
};

module.exports = { listHolidays, getSettings, previewImpact, createHoliday, updateHoliday, deleteHoliday, updateSettings, recalculate };
