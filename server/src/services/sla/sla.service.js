const bankRepository = require("../../repositories/bank.repository");
const prioritySlaService = require("../priority-sla.service");
const { getCalendar, addWorkingHours } = require("./business-calendar");
// Company holidays feed every calendar (registers the provider once).
require("./holiday-calendar");
const { toIst } = require("../../utils/time");

// SLA = request time + priority hours on the bank's working days (not from triage); never pauses for status.
const toDate = (value) => (value instanceof Date ? value : new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`));

const computeSlaDueDate = ({ createdTime, priority, bankId, orgId }) => {
    if (!priority) return null;
    const slaHours = prioritySlaService.getSlaHoursForPriority(orgId, priority);
    if (!slaHours) return null;
    const bank = bankId ? bankRepository.findById(bankId) : null;
    return toIst(addWorkingHours(toDate(createdTime), slaHours, getCalendar(bank)));
};

module.exports = { computeSlaDueDate };
