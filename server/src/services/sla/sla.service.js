const bankRepository = require("../../repositories/bank.repository");
const prioritySlaService = require("../priority-sla.service");
const { getCalendar, addWorkingHours } = require("./business-calendar");

/**
 * SLA due date = the ticket's Created_Time + the priority's SLA hours,
 * counted on the bank's working-day calendar (non-working days skipped,
 * 24x7 banks count every day). The clock starts when the request came in,
 * not when a priority was picked - a P1 triaged a day late is already a
 * day into its SLA. The SLA never pauses for status changes.
 *
 * Returns null when there is no priority or no SLA hours configured for it.
 */
const toDate = (value) => (value instanceof Date ? value : new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`));

const computeSlaDueDate = ({ createdTime, priority, bankId, orgId }) => {
    if (!priority) return null;
    const slaHours = prioritySlaService.getSlaHoursForPriority(orgId, priority);
    if (!slaHours) return null;
    const bank = bankId ? bankRepository.findById(bankId) : null;
    return addWorkingHours(toDate(createdTime), slaHours, getCalendar(bank)).toISOString();
};

module.exports = { computeSlaDueDate };
