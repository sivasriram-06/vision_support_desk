/**
 * Pure maths for the ticket Tracking tab - no DB access. Times are epoch
 * milliseconds; open intervals are closed at `now` (or the ticket's
 * resolved time) by the caller.
 *
 * `measure(startMs, endMs)` returns the minutes to report for a stretch
 * (callers pass elapsed minutes and bank support-hours minutes).
 */

const WAIT_STATES = new Set(["PENDING", "WAITING", "READY", "ON_HOLD"]);

const MINUTE = 60000;
const elapsedMinutes = (startMs, endMs) => Math.max(0, Math.floor((endMs - startMs) / MINUTE));

/** Total minutes covered by the union of [start, end) intervals - overlapping parallel work counts once. */
const unionMinutes = (intervals) => {
    const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
    let total = 0;
    let curStart = null;
    let curEnd = null;
    for (const { start, end } of sorted) {
        if (curEnd === null || start > curEnd) {
            if (curEnd !== null) total += curEnd - curStart;
            curStart = start;
            curEnd = end;
        } else if (end > curEnd) {
            curEnd = end;
        }
    }
    if (curEnd !== null) total += curEnd - curStart;
    return Math.floor(total / MINUTE);
};

/**
 * Time in each ticket status, from the status-change events.
 * `changes` = [{ time, from, to }] sorted by time; the ticket starts in
 * `initialStatus` at `startMs` and the last stretch runs to `endMs`.
 */
const statusStretches = ({ startMs, endMs, initialStatus, changes }) => {
    const stretches = [];
    let status = initialStatus;
    let from = startMs;
    for (const change of changes) {
        if (change.time > from) stretches.push({ status, start: from, end: change.time });
        status = change.to;
        from = Math.max(from, change.time);
    }
    if (endMs > from) stretches.push({ status, start: from, end: endMs });
    return stretches;
};

/** Sum of `measure` per key over stretches, e.g. minutes per work state. */
const sumBy = (stretches, keyOf, measure) =>
    stretches.reduce((acc, s) => {
        const key = keyOf(s);
        acc[key] = (acc[key] || 0) + measure(s.start, s.end);
        return acc;
    }, {});

/**
 * Critical path through the dependency graph: the chain of assignments
 * (blocker -> dependent) with the largest total span. `lanes` =
 * [{ id, spanMinutes }], `edges` = [{ from: blockerId, to: dependentId }].
 * Returns { ids: [...] in order, slowestId } - empty when no lanes.
 */
const criticalPath = (lanes, edges) => {
    const span = new Map(lanes.map((l) => [l.id, l.spanMinutes]));
    const preds = new Map(lanes.map((l) => [l.id, []]));
    edges.forEach((e) => preds.has(e.to) && span.has(e.from) && preds.get(e.to).push(e.from));

    const best = new Map(); // id -> { total, prev }
    const visiting = new Set();
    const solve = (id) => {
        if (best.has(id)) return best.get(id);
        if (visiting.has(id)) return { total: span.get(id), prev: null }; // defensive: no cycles expected
        visiting.add(id);
        let pick = { total: span.get(id), prev: null };
        for (const p of preds.get(id)) {
            const candidate = solve(p).total + span.get(id);
            if (candidate > pick.total) pick = { total: candidate, prev: p };
        }
        visiting.delete(id);
        best.set(id, pick);
        return pick;
    };

    let endId = null;
    for (const l of lanes) {
        if (endId === null || solve(l.id).total > solve(endId).total) endId = l.id;
    }
    const ids = [];
    for (let cur = endId; cur; cur = best.get(cur).prev) ids.unshift(cur);
    const slowestId = ids.reduce((a, b) => (a === null || span.get(b) > span.get(a) ? b : a), null);
    return { ids, slowestId, totalMinutes: endId ? best.get(endId).total : 0 };
};

/**
 * The single longest wait on the ticket - the answer to "where did it get
 * stuck". Candidates: an assignee's PENDING / WAITING / READY / ON_HOLD
 * stretch, and ticket status stretches whose clock is NOT_STARTED
 * (waiting to be picked up) or PAUSED (waiting on the bank).
 */
const longestWait = ({ laneStretches, statusStretchList, clockOf }) => {
    let best = null;
    const consider = (candidate) => {
        if (!best || candidate.minutes > best.minutes) best = candidate;
    };
    for (const s of laneStretches) {
        if (WAIT_STATES.has(s.state)) consider({ kind: "WORK", state: s.state, laneId: s.laneId, start: s.start, end: s.end, minutes: elapsedMinutes(s.start, s.end) });
    }
    for (const s of statusStretchList) {
        const clock = clockOf(s.status);
        if (clock === "NOT_STARTED" || clock === "PAUSED") {
            consider({ kind: "STATUS", status: s.status, clock, start: s.start, end: s.end, minutes: elapsedMinutes(s.start, s.end) });
        }
    }
    return best;
};

module.exports = { WAIT_STATES, elapsedMinutes, unionMinutes, statusStretches, sumBy, criticalPath, longestWait };
