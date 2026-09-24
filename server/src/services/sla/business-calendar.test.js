const test = require("node:test");
const assert = require("node:assert/strict");
const { DateTime } = require("luxon");
const { getCalendar, addWorkingHours, workingMinutesBetween } = require("./business-calendar");

const kenyaMonFri = getCalendar({ Working_Days: "MON,TUE,WED,THU,FRI", Time_Zone: "Africa/Nairobi", Is_24x7: "N" });
const kenya24x7 = getCalendar({ Working_Days: "MON,TUE,WED,THU,FRI", Time_Zone: "Africa/Nairobi", Is_24x7: "Y" });
const muscatSunThu = getCalendar({ Working_Days: "SUN,MON,TUE,WED,THU", Time_Zone: "Asia/Muscat", Is_24x7: "N" });

// 2026-09-25 is a Friday.
const local = (iso, zone) => DateTime.fromISO(iso, { zone }).toJSDate();
const asLocal = (date, zone) => DateTime.fromJSDate(date, { zone }).toFormat("ccc yyyy-MM-dd HH:mm");

test("P1 raised Friday evening on a Mon-Fri bank is due Monday", () => {
    const due = addWorkingHours(local("2026-09-25T18:00", "Africa/Nairobi"), 24, kenyaMonFri);
    assert.equal(asLocal(due, "Africa/Nairobi"), "Mon 2026-09-28 18:00");
});

test("same ticket on a 24x7 bank is due Saturday", () => {
    const due = addWorkingHours(local("2026-09-25T18:00", "Africa/Nairobi"), 24, kenya24x7);
    assert.equal(asLocal(due, "Africa/Nairobi"), "Sat 2026-09-26 18:00");
});

test("a ticket raised on Saturday starts counting Monday 00:00", () => {
    const due = addWorkingHours(local("2026-09-26T10:00", "Africa/Nairobi"), 24, kenyaMonFri);
    assert.equal(asLocal(due, "Africa/Nairobi"), "Tue 2026-09-29 00:00");
});

test("Sun-Thu bank skips Friday and Saturday", () => {
    const due = addWorkingHours(local("2026-09-24T20:00", "Asia/Muscat"), 24, muscatSunThu);
    assert.equal(asLocal(due, "Asia/Muscat"), "Sun 2026-09-27 20:00");
});

test("P3 (240h = 10 working days) spans two weekends", () => {
    const due = addWorkingHours(local("2026-09-21T09:00", "Africa/Nairobi"), 240, kenyaMonFri);
    assert.equal(asLocal(due, "Africa/Nairobi"), "Mon 2026-10-05 09:00");
});

test("workingMinutesBetween excludes the weekend", () => {
    const from = local("2026-09-25T18:00", "Africa/Nairobi"); // Fri
    const to = local("2026-09-28T02:00", "Africa/Nairobi"); // Mon
    assert.equal(workingMinutesBetween(from, to, kenyaMonFri), 6 * 60 + 2 * 60);
    assert.equal(workingMinutesBetween(from, to, kenya24x7), 56 * 60);
});

test("workingMinutesBetween is zero for an empty or reversed range", () => {
    const at = local("2026-09-25T18:00", "Africa/Nairobi");
    assert.equal(workingMinutesBetween(at, at, kenyaMonFri), 0);
    assert.equal(workingMinutesBetween(at, new Date(at.getTime() - 1000), kenyaMonFri), 0);
});
