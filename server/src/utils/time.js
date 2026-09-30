const { DateTime } = require("luxon");

/**
 * One timestamp format for everything stored: ISO-8601 in IST with its
 * offset, e.g. 2026-09-30T17:53:00.123+05:30.
 *
 *  - Unambiguous: the offset is part of the value, so new Date(value),
 *    luxon and SQLite's date functions all read the right instant.
 *  - Sortable: every value carries the same +05:30, so plain text order
 *    and SQL < / > comparisons are time order.
 *
 * Always write times through nowIst() / toIst() in JS and NOW_IST_SQL in
 * SQL - never Date#toISOString() (UTC "Z") or SQLite datetime('now')
 * ("YYYY-MM-DD HH:MM:SS" UTC). Mixing formats is what breaks comparisons.
 */
const IST_ZONE = "Asia/Kolkata";

// strftime's %f is SS.SSS; SQLite has no zone database, so IST = UTC + 330 min.
const NOW_IST_SQL = "strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes')";

/** Any instant (Date, ms, or a time string in any format) -> IST ISO string; null for empty/invalid. */
const toIst = (value) => {
    if (value === null || value === undefined || value === "") return null;
    let dt;
    if (value instanceof Date) dt = DateTime.fromJSDate(value);
    else if (typeof value === "number") dt = DateTime.fromMillis(value);
    else {
        const text = String(value).trim();
        // "YYYY-MM-DD HH:MM:SS" without a zone is SQLite's datetime('now') = UTC.
        dt = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text)
            ? DateTime.fromSQL(text, { zone: "utc" })
            : DateTime.fromISO(text, { setZone: true });
    }
    if (!dt.isValid) return null;
    return dt.setZone(IST_ZONE).toISO({ suppressMilliseconds: false, includeOffset: true });
};

/** The current instant in IST ISO. */
const nowIst = () => toIst(new Date());

module.exports = { IST_ZONE, NOW_IST_SQL, toIst, nowIst };
