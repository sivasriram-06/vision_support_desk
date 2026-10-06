// Pure Tracking maths over epoch ms; callers close open intervals and pass `measure` (elapsed/support mins).

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

// Status stretches from time-sorted changes, starting in `initialStatus` at `startMs`, last running to `endMs`.
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

// Critical path: the blocker -> dependent chain of assignments with the largest total span.
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
        // solve() first: short-circuiting it left a single-assignee ticket with no path entry.
        const total = solve(l.id).total;
        if (endId === null || total > best.get(endId).total) endId = l.id;
    }
    const ids = [];
    for (let cur = endId; cur; cur = best.get(cur).prev) ids.unshift(cur);
    const slowestId = ids.reduce((a, b) => (a === null || span.get(b) > span.get(a) ? b : a), null);
    return { ids, slowestId, totalMinutes: endId ? best.get(endId).total : 0 };
};

// "Where did it get stuck": longest assignee wait-state or NOT_STARTED/PAUSED status stretch.
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
