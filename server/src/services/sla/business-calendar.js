const { DateTime } = require("luxon");
const env = require("../../config/env");

/**
 * Working-day calendar maths for SLA due dates and resolution time.
 *
 * Rule (agreed with the support team): time is counted in real hours, but
 * a bank's non-working days are skipped as whole days in the bank's own
 * local time. A P1 (24h) raised Friday 18:00 on a Mon-Fri bank is due
 * Monday 18:00; on a 24x7 bank it is due Saturday 18:00. The SLA does not
 * apply support hours within a day - only which days count.
 *
 * Resolution time is stricter: only minutes inside the bank's support
 * window (Support_Start_Ist..Support_End_Ist, IST) on its working days
 * count (supportMinutesBetween). A 24x7 bank counts every minute.
 *
 * Pure functions: callers pass UTC Date objects and get UTC Dates back.
 */
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]; // luxon weekday 1..7
const DEFAULT_WORKING_DAYS = ["MON", "TUE", "WED", "THU", "FRI"];
// Support hours are kept on the support team's clock (IST), as in the KB sheet.
const SUPPORT_HOURS_ZONE = "Asia/Kolkata";
const DEFAULT_SUPPORT_START_IST = "10:30";
const DEFAULT_SUPPORT_END_IST = "19:30";

const parseWorkingDays = (csv) => {
    const days = (csv || "").split(",").map((d) => d.trim().toUpperCase()).filter((d) => WEEKDAYS.includes(d));
    return days.length > 0 ? days : DEFAULT_WORKING_DAYS;
};

/**
 * Calendar for a bank row (HD_BANK_MASTER), or the org default when the
 * ticket has no bank yet. `hours` is the IST support window used for
 * resolution time; null on a 24x7 bank (every minute counts).
 */
const getCalendar = (bank) => {
    if (!bank) {
        return {
            workingDays: new Set(DEFAULT_WORKING_DAYS),
            timeZone: env.timezone,
            hours: { start: DEFAULT_SUPPORT_START_IST, end: DEFAULT_SUPPORT_END_IST, zone: SUPPORT_HOURS_ZONE }
        };
    }
    const is24x7 = bank.Is_24x7 === "Y";
    return {
        workingDays: new Set(is24x7 ? WEEKDAYS : parseWorkingDays(bank.Working_Days)),
        timeZone: bank.Time_Zone || env.timezone,
        hours: is24x7
            ? null
            : {
                start: bank.Support_Start_Ist || DEFAULT_SUPPORT_START_IST,
                end: bank.Support_End_Ist || DEFAULT_SUPPORT_END_IST,
                zone: SUPPORT_HOURS_ZONE
            }
    };
};

const isWorkingDay = (dt, calendar) => calendar.workingDays.has(WEEKDAYS[dt.setZone(calendar.timeZone).weekday - 1]);

/** "HH:MM" -> { hour, minute }. */
const parseHhmm = (value) => {
    const [hour, minute] = String(value).split(":").map(Number);
    return { hour, minute };
};

/** Walks back from `startUtc`, mirror of the forward walk below. */
const subtractWorkingHours = (startUtc, hours, calendar) => {
    let remainingMs = hours * 60 * 60 * 1000;
    let cursor = DateTime.fromJSDate(startUtc, { zone: calendar.timeZone });

    for (let guard = 0; guard < 10000; guard += 1) {
        // The local day holding the instant just before the cursor.
        const dayStart = cursor.minus({ milliseconds: 1 }).startOf("day");
        if (!isWorkingDay(dayStart, calendar)) {
            cursor = dayStart;
            continue;
        }
        const availableMs = cursor.toMillis() - dayStart.toMillis();
        if (remainingMs <= availableMs) {
            return cursor.minus({ milliseconds: remainingMs }).toJSDate();
        }
        remainingMs -= availableMs;
        cursor = dayStart;
    }
    throw new Error("addWorkingHours: calendar has no working days");
};

/**
 * start + hours, counting only time that falls on working days. If the
 * start is on a non-working day the clock begins at the next working
 * day's 00:00 local. Negative hours walk backwards the same way ("4 hours
 * before due" for escalation triggers).
 */
const addWorkingHours = (startUtc, hours, calendar) => {
    if (hours === 0) return new Date(startUtc.getTime());
    if (hours < 0) return subtractWorkingHours(startUtc, -hours, calendar);
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

/**
 * Whole minutes in [fromUtc, toUtc) that fall inside the bank's support
 * window on its working days - resolution time. Walks IST days; a day's
 * window counts when the bank's local weekday at the window start is a
 * working day. A 24x7 calendar (hours = null) counts every minute.
 */
const supportMinutesBetween = (fromUtc, toUtc, calendar) => {
    if (!calendar.hours) return workingMinutesBetween(fromUtc, toUtc, calendar);
    if (!fromUtc || !toUtc || toUtc <= fromUtc) return 0;

    const start = parseHhmm(calendar.hours.start);
    const end = parseHhmm(calendar.hours.end);
    const fromMs = fromUtc.getTime();
    const toMs = toUtc.getTime();
    let totalMs = 0;
    let day = DateTime.fromJSDate(fromUtc, { zone: calendar.hours.zone }).startOf("day");
    const lastDay = DateTime.fromJSDate(toUtc, { zone: calendar.hours.zone }).startOf("day");

    while (day <= lastDay) {
        const windowStart = day.set({ hour: start.hour, minute: start.minute });
        const windowEnd = day.set({ hour: end.hour, minute: end.minute });
        if (isWorkingDay(windowStart, calendar)) {
            const sliceStart = Math.max(fromMs, windowStart.toMillis());
            const sliceEnd = Math.min(toMs, windowEnd.toMillis());
            if (sliceEnd > sliceStart) totalMs += sliceEnd - sliceStart;
        }
        day = day.plus({ days: 1 });
    }
    return Math.floor(totalMs / 60000);
};

module.exports = {
    WEEKDAYS,
    DEFAULT_WORKING_DAYS,
    DEFAULT_SUPPORT_START_IST,
    DEFAULT_SUPPORT_END_IST,
    parseWorkingDays,
    getCalendar,
    addWorkingHours,
    workingMinutesBetween,
    supportMinutesBetween
};
