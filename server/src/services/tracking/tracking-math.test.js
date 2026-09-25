const test = require("node:test");
const assert = require("node:assert/strict");
const { unionMinutes, statusStretches, criticalPath, longestWait, sumBy, elapsedMinutes } = require("./tracking-math");

const H = 60 * 60000;

test("parallel work counts once in busy time", () => {
    // Support 0-4h and Java 2-6h overlap 2h: busy = 6h, not 8h.
    assert.equal(unionMinutes([{ start: 0, end: 4 * H }, { start: 2 * H, end: 6 * H }]), 6 * 60);
});

test("gaps between work are not busy", () => {
    assert.equal(unionMinutes([{ start: 0, end: H }, { start: 3 * H, end: 4 * H }]), 2 * 60);
    assert.equal(unionMinutes([]), 0);
});

test("status stretches follow the change events", () => {
    const stretches = statusStretches({
        startMs: 0,
        endMs: 10 * H,
        initialStatus: "Unassigned",
        changes: [{ time: H, from: "Unassigned", to: "Open" }, { time: 3 * H, from: "Open", to: "In Progress" }]
    });
    assert.deepEqual(stretches.map((s) => [s.status, (s.end - s.start) / H]), [["Unassigned", 1], ["Open", 2], ["In Progress", 7]]);
    const perStatus = sumBy(stretches, (s) => s.status, elapsedMinutes);
    assert.equal(perStatus["In Progress"], 7 * 60);
});

test("critical path picks the longest dependent chain", () => {
    // Java (10h) blocks Support (3h); Angular (5h) runs in parallel.
    const path = criticalPath(
        [{ id: "java", spanMinutes: 600 }, { id: "support", spanMinutes: 180 }, { id: "angular", spanMinutes: 300 }],
        [{ from: "java", to: "support" }]
    );
    assert.deepEqual(path.ids, ["java", "support"]);
    assert.equal(path.slowestId, "java");
    assert.equal(path.totalMinutes, 780);
});

test("critical path with no dependencies is the single longest lane", () => {
    const path = criticalPath([{ id: "a", spanMinutes: 60 }, { id: "b", spanMinutes: 90 }], []);
    assert.deepEqual(path.ids, ["b"]);
});

test("longest wait compares work waits with bank waits", () => {
    const wait = longestWait({
        laneStretches: [
            { laneId: "support", state: "WAITING", start: 0, end: 5 * H },
            { laneId: "support", state: "IN_PROGRESS", start: 5 * H, end: 20 * H }
        ],
        statusStretchList: [{ status: "On Hold - Client", start: 0, end: 8 * H }],
        clockOf: (status) => (status === "On Hold - Client" ? "PAUSED" : "RUNNING")
    });
    assert.equal(wait.kind, "STATUS");
    assert.equal(wait.minutes, 8 * 60);
});
