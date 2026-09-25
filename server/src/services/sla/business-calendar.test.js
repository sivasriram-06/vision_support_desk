const test = require("node:test");
const assert = require("node:assert/strict");
const { DateTime } = require("luxon");
const { getCalendar, addWorkingHours, workingMinutesBetween, supportMinutesBetween } = require("./business-calendar");

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

const IST = "Asia/Kolkata";
const kenyaHours = getCalendar({ Working_Days: "MON,TUE,WED,THU,FRI", Time_Zone: "Africa/Nairobi", Is_24x7: "N", Support_Start_Ist: "10:30", Support_End_Ist: "19:30" });

test("supportMinutesBetween counts only the IST support window", () => {
    // Fri 09:00-21:00 IST on a 10:30-19:30 bank = 9h; on 24x7 the full 12h.
    const from = local("2026-09-25T09:00", IST);
    const to = local("2026-09-25T21:00", IST);
    assert.equal(supportMinutesBetween(from, to, kenyaHours), 9 * 60);
    assert.equal(supportMinutesBetween(from, to, kenya24x7), 12 * 60);
});

test("supportMinutesBetween skips the weekend and off-hours", () => {
    // Fri 18:00 IST -> Mon 12:00 IST: Fri 18:00-19:30 + Mon 10:30-12:00 = 3h.
    const from = local("2026-09-25T18:00", IST);
    const to = local("2026-09-28T12:00", IST);
    assert.equal(supportMinutesBetween(from, to, kenyaHours), 3 * 60);
});

test("supportMinutesBetween is zero outside the window", () => {
    const from = local("2026-09-24T20:00", IST); // Thu evening
    const to = local("2026-09-25T10:00", IST); // Fri, before 10:30
    assert.equal(supportMinutesBetween(from, to, kenyaHours), 0);
});

test("no bank uses the default Mon-Fri 10:30-19:30 IST window", () => {
    const from = local("2026-09-25T00:00", IST);
    const to = local("2026-09-26T00:00", IST);
    assert.equal(supportMinutesBetween(from, to, getCalendar(null)), 9 * 60);
});

test("negative hours walk back across the weekend", () => {
    // Mon 02:00 minus 4 working hours: Mon 00:00-02:00 (2h), skip Sat/Sun, Fri 22:00.
    const at = addWorkingHours(local("2026-09-28T02:00", "Africa/Nairobi"), -4, kenyaMonFri);
    assert.equal(asLocal(at, "Africa/Nairobi"), "Fri 2026-09-25 22:00");
    const same = addWorkingHours(local("2026-09-28T02:00", "Africa/Nairobi"), 0, kenyaMonFri);
    assert.equal(asLocal(same, "Africa/Nairobi"), "Mon 2026-09-28 02:00");
});

test("workingMinutesBetween is zero for an empty or reversed range", () => {
    const at = local("2026-09-25T18:00", "Africa/Nairobi");
    assert.equal(workingMinutesBetween(at, at, kenyaMonFri), 0);
    assert.equal(workingMinutesBetween(at, new Date(at.getTime() - 1000), kenyaMonFri), 0);
});
