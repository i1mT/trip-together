import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema } from "../../shared/market";
import { shiftSnapshot } from "../../worker/market/snapshot";
import { tripInput, eventInput } from "../support/api";
import { localInput, zonedChoices } from "../../shared/zoned-input";
test("公开 schema 可在运行时加载；夏令时复制保持当地时刻，歧义拒绝", () => {
  const original = snapshotSchema.parse({
    trip: { ...tripInput, start_date: "2030-03-01", end_date: "2030-03-02" },
    events: [
      {
        ...eventInput,
        start: "2030-03-01T10:00:00+01:00",
        end: "2030-03-01T12:00:00+01:00",
        timezone: "Europe/Paris",
        endTimezone: "Europe/Paris",
      },
    ],
  });
  const shifted = shiftSnapshot(original, "2030-04-01");
  assert.equal(
    localInput(shifted.events[0].start, "Europe/Paris"),
    "2030-04-01T10:00",
  );
  assert.equal(shifted.trip.end_date, "2030-04-02");
  const gap = structuredClone(original);
  gap.events[0].start = "2030-03-01T02:30:00+01:00";
  assert.throws(() => shiftSnapshot(gap, "2030-03-31"));
  assert.deepEqual(zonedChoices("2026-11-01T01:30", "America/New_York"), [
    "2026-11-01T05:30:00.000Z",
    "2026-11-01T06:30:00.000Z",
  ]);
  assert.equal(zonedChoices("2030-10-27T02:30", "Europe/Paris").length, 2);
});
