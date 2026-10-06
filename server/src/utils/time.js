const { DateTime } = require("luxon");

// All stored times are IST ISO (+05:30) via nowIst/toIst/NOW_IST_SQL; mixing UTC formats breaks text comparisons.
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
