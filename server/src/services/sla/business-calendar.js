const { DateTime } = require("luxon");
const env = require("../../config/env");

// SLA skips whole non-working/holiday days; resolution time counts only support-window minutes (24x7: all).
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

// { dates: Set("YYYY-MM-DD"), applyTo24x7: bool } - IST days, each entered by an admin / lead.
const NO_HOLIDAYS = { dates: new Set(), applyTo24x7: false };
let holidayProvider = () => NO_HOLIDAYS;
/** Registered by holiday.service.js; returns the (cached) company holidays. */
const setHolidayProvider = (provider) => {
    holidayProvider = provider || (() => NO_HOLIDAYS);
};

// Bank calendar (org default with no bank); `hours` = IST support window, null on 24x7 (every minute counts).
const getCalendar = (bank) => {
    const company = holidayProvider();
    if (!bank) {
        return {
            workingDays: new Set(DEFAULT_WORKING_DAYS),
            timeZone: env.timezone,
            hours: { start: DEFAULT_SUPPORT_START_IST, end: DEFAULT_SUPPORT_END_IST, zone: SUPPORT_HOURS_ZONE },
            holidays: company
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
            },
        // Premium (24x7) banks keep counting on our holidays unless the setting says otherwise.
        holidays: is24x7 && !company.applyTo24x7 ? NO_HOLIDAYS : company
    };
};

const isWorkingDay = (dt, calendar) => calendar.workingDays.has(WEEKDAYS[dt.setZone(calendar.timeZone).weekday - 1]);

/** Is this IST day ("YYYY-MM-DD") a company holiday on this calendar? */
const isHolidayDate = (isoDate, calendar) => (calendar.holidays || NO_HOLIDAYS).dates.has(isoDate);

/** The company holiday ranges [startMs, endMs) (whole IST days) that overlap [fromMs, toMs). */
const holidayRanges = (fromMs, toMs, calendar) => {
    const h = calendar.holidays || NO_HOLIDAYS;
    if (toMs <= fromMs || h.dates.size === 0) return [];
    const ranges = [];
    let day = DateTime.fromMillis(fromMs, { zone: SUPPORT_HOURS_ZONE }).startOf("day");
    while (day.toMillis() < toMs) {
        const next = day.plus({ days: 1 });
        if (isHolidayDate(day.toISODate(), calendar)) ranges.push([Math.max(day.toMillis(), fromMs), Math.min(next.toMillis(), toMs)]);
        day = next;
    }
    return ranges;
};

/** [fromMs, toMs) minus company holidays, as ordered free intervals. */
const freeIntervals = (fromMs, toMs, calendar) => {
    const out = [];
    let cursor = fromMs;
    for (const [s, e] of holidayRanges(fromMs, toMs, calendar)) {
        if (s > cursor) out.push([cursor, s]);
        cursor = Math.max(cursor, e);
    }
    if (cursor < toMs) out.push([cursor, toMs]);
    return out;
};

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
        // Walk the day's free time (holidays cut out) latest-first.
        const free = freeIntervals(dayStart.toMillis(), cursor.toMillis(), calendar).reverse();
        for (const [s, e] of free) {
            if (remainingMs <= e - s) return new Date(e - remainingMs);
            remainingMs -= e - s;
        }
        cursor = dayStart;
    }
    throw new Error("addWorkingHours: calendar has no working days");
};

// start + hours on working days only; negative hours walk backwards ("4h before due" escalation triggers).
const addWorkingHours = (startUtc, hours, calendar) => {
    if (hours === 0) return new Date(startUtc.getTime());
    if (hours < 0) return subtractWorkingHours(startUtc, -hours, calendar);
    let remainingMs = hours * 60 * 60 * 1000;
    let cursor = DateTime.fromJSDate(startUtc, { zone: calendar.timeZone });

    // Guard: never loop forever on bad data, even though parseWorkingDays defaults an empty calendar.
    for (let guard = 0; guard < 10000; guard += 1) {
        if (!isWorkingDay(cursor, calendar)) {
            cursor = cursor.plus({ days: 1 }).startOf("day");
            continue;
        }
        const endOfDay = cursor.plus({ days: 1 }).startOf("day");
        // The day's free time - company holidays (IST days) cut out.
        for (const [s, e] of freeIntervals(cursor.toMillis(), endOfDay.toMillis(), calendar)) {
            if (remainingMs <= e - s) return new Date(s + remainingMs);
            remainingMs -= e - s;
        }
        cursor = endOfDay;
    }
    throw new Error("addWorkingHours: calendar has no working days");
};

/** Whole minutes in [fromUtc, toUtc) that fall on working days, holidays excluded. */
const workingMinutesBetween = (fromUtc, toUtc, calendar) => {
    if (!fromUtc || !toUtc || toUtc <= fromUtc) return 0;
    let totalMs = 0;
    let cursor = DateTime.fromJSDate(fromUtc, { zone: calendar.timeZone });
    const end = DateTime.fromJSDate(toUtc, { zone: calendar.timeZone });

    while (cursor < end) {
        const endOfDay = cursor.plus({ days: 1 }).startOf("day");
        const sliceEnd = endOfDay < end ? endOfDay : end;
        if (isWorkingDay(cursor, calendar)) {
            for (const [s, e] of freeIntervals(cursor.toMillis(), sliceEnd.toMillis(), calendar)) totalMs += e - s;
        }
        cursor = sliceEnd;
    }
    return Math.floor(totalMs / 60000);
};

// Resolution minutes in [fromUtc, toUtc) inside the support window on working days; 24x7 counts every minute.
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
        // The window sits inside this IST day, so a holiday skips it whole.
        if (isWorkingDay(windowStart, calendar) && !isHolidayDate(day.toISODate(), calendar)) {
            const sliceStart = Math.max(fromMs, windowStart.toMillis());
            const sliceEnd = Math.min(toMs, windowEnd.toMillis());
            if (sliceEnd > sliceStart) totalMs += sliceEnd - sliceStart;
        }
        day = day.plus({ days: 1 });
    }
    return Math.floor(totalMs / 60000);
};

// { counting, until } at `now` (until = next flip, null on 24x7) so the browser ticks without polling.
const supportClockNow = (calendar, now = new Date()) => {
    const nowMs = now.getTime();
    if (!calendar.hours) {
        // 24x7: counts every minute, except company holidays when they apply to 24x7.
        const today = DateTime.fromMillis(nowMs, { zone: SUPPORT_HOURS_ZONE }).startOf("day");
        if (isHolidayDate(today.toISODate(), calendar)) {
            let next = today.plus({ days: 1 });
            for (let i = 0; i < 366 && isHolidayDate(next.toISODate(), calendar); i += 1) next = next.plus({ days: 1 });
            return { counting: false, until: next.toJSDate() };
        }
        const upcoming = holidayRanges(nowMs, today.plus({ days: 366 }).toMillis(), calendar)[0];
        return { counting: true, until: upcoming ? new Date(upcoming[0]) : null };
    }
    const start = parseHhmm(calendar.hours.start);
    const end = parseHhmm(calendar.hours.end);
    let day = DateTime.fromJSDate(now, { zone: calendar.hours.zone }).startOf("day");
    for (let i = 0; i < 30; i += 1) {
        const windowStart = day.set({ hour: start.hour, minute: start.minute });
        const windowEnd = day.set({ hour: end.hour, minute: end.minute });
        if (isWorkingDay(windowStart, calendar) && !isHolidayDate(day.toISODate(), calendar)) {
            if (nowMs < windowStart.toMillis()) return { counting: false, until: windowStart.toJSDate() };
            if (nowMs < windowEnd.toMillis()) return { counting: true, until: windowEnd.toJSDate() };
        }
        day = day.plus({ days: 1 });
    }
    return { counting: false, until: null };
};

module.exports = {
    supportClockNow,
    setHolidayProvider,
    isHolidayDate,
    holidayRanges,
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
