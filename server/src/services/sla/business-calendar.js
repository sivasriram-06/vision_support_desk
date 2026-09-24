const { DateTime } = require("luxon");
const env = require("../../config/env");

/**
 * Working-day calendar maths for SLA due dates and resolution time.
 *
 * Rule (agreed with the support team): time is counted in real hours, but
 * a bank's non-working days are skipped as whole days in the bank's own
 * local time. A P1 (24h) raised Friday 18:00 on a Mon-Fri bank is due
 * Monday 18:00; on a 24x7 bank it is due Saturday 18:00. Support hours
 * within a day are NOT applied - only which days count.
 *
 * Pure functions: callers pass UTC Date objects and get UTC Dates back.
 */
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]; // luxon weekday 1..7
const DEFAULT_WORKING_DAYS = ["MON", "TUE", "WED", "THU", "FRI"];

const parseWorkingDays = (csv) => {
    const days = (csv || "").split(",").map((d) => d.trim().toUpperCase()).filter((d) => WEEKDAYS.includes(d));
    return days.length > 0 ? days : DEFAULT_WORKING_DAYS;
};

/** Calendar for a bank row (HD_BANK_MASTER), or the org default when the ticket has no bank yet. */
const getCalendar = (bank) => {
    if (!bank) {
        return { workingDays: new Set(DEFAULT_WORKING_DAYS), timeZone: env.timezone };
    }
    const workingDays = bank.Is_24x7 === "Y" ? WEEKDAYS : parseWorkingDays(bank.Working_Days);
    return { workingDays: new Set(workingDays), timeZone: bank.Time_Zone || env.timezone };
};

const isWorkingDay = (dt, calendar) => calendar.workingDays.has(WEEKDAYS[dt.weekday - 1]);

/**
 * start + hours, counting only time that falls on working days. If the
 * start is on a non-working day the clock begins at the next working
 * day's 00:00 local.
 */
const addWorkingHours = (startUtc, hours, calendar) => {
    let remainingMs = hours * 60 * 60 * 1000;
    let cursor = DateTime.fromJSDate(startUtc, { zone: calendar.timeZone });

    // Guard: an empty calendar can't happen (parseWorkingDays defaults), but
    // never loop forever on bad data.
    for (let guard = 0; guard < 10000; guard += 1) {
        if (!isWorkingDay(cursor, calendar)) {
            cursor = cursor.plus({ days: 1 }).startOf("day");
            continue;
        }
        const endOfDay = cursor.plus({ days: 1 }).startOf("day");
        const availableMs = endOfDay.toMillis() - cursor.toMillis();
        if (remainingMs <= availableMs) {
            return cursor.plus({ milliseconds: remainingMs }).toJSDate();
        }
        remainingMs -= availableMs;
        cursor = endOfDay;
    }
    throw new Error("addWorkingHours: calendar has no working days");
};

/** Whole minutes in [fromUtc, toUtc) that fall on working days. */
const workingMinutesBetween = (fromUtc, toUtc, calendar) => {
    if (!fromUtc || !toUtc || toUtc <= fromUtc) return 0;
    let totalMs = 0;
    let cursor = DateTime.fromJSDate(fromUtc, { zone: calendar.timeZone });
    const end = DateTime.fromJSDate(toUtc, { zone: calendar.timeZone });

    while (cursor < end) {
        const endOfDay = cursor.plus({ days: 1 }).startOf("day");
        const sliceEnd = endOfDay < end ? endOfDay : end;
        if (isWorkingDay(cursor, calendar)) {
            totalMs += sliceEnd.toMillis() - cursor.toMillis();
        }
        cursor = sliceEnd;
    }
    return Math.floor(totalMs / 60000);
};

module.exports = { WEEKDAYS, DEFAULT_WORKING_DAYS, parseWorkingDays, getCalendar, addWorkingHours, workingMinutesBetween };
