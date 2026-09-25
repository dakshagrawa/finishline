import assert from "node:assert/strict";
import test from "node:test";
import {
  getMvhsDay,
  MVHS_SCHEDULE_SOURCE,
  type ScheduleBlock,
} from "../src/mvhs/schedule";

test("dates before the 2026-27 first day are shown as no school", () => {
  const day = getMvhsDay("2026-08-06", 12 * 60);
  assert.equal(day.kind, "no-school");
  assert.match(day.reason, /before the first day/i);
  assert.equal(day.blocks.length, 0);
});

test("official 2026-27 closure dates do not show a regular schedule", () => {
  const day = getMvhsDay("2026-09-07", 9 * 60);
  assert.equal(day.kind, "no-school");
  assert.equal(day.reason, "Labor Day · no classes");
});

test("Tuesday regular schedule reports the next period between blocks", () => {
  const day = getMvhsDay("2026-08-18", 10 * 60 + 2);
  assert.equal(day.kind, "school-day");
  assert.deepEqual(day.blocks.map((block: ScheduleBlock) => block.label), [
    "Period 1",
    "Period 2",
    "Brunch",
    "Period 3",
    "Lunch",
    "Period 7",
  ]);
  assert.equal(day.active, null);
  assert.equal(day.next?.label, "Period 2");
  assert.equal(day.minutesUntilNext, 3);
});

test("Wednesday regular schedule identifies tutorial as active", () => {
  const day = getMvhsDay("2026-08-19", 10 * 60 + 15);
  assert.equal(day.kind, "school-day");
  assert.equal(day.active?.label, "Tutorial");
  assert.equal(day.next?.label, "Brunch");
});

test("weekends are no-school days", () => {
  const day = getMvhsDay("2026-08-22", 10 * 60);
  assert.equal(day.kind, "no-school");
  assert.equal(day.reason, "Weekend · no classes");
});

test("schedule provenance stays explicit", () => {
  assert.match(MVHS_SCHEDULE_SOURCE.label, /2025.?26/i);
  assert.match(MVHS_SCHEDULE_SOURCE.label, /reference template/i);
  assert.match(getMvhsDay("2026-08-18", 9 * 60).reason, /not confirmed for 2026.?27/i);
  assert.equal(MVHS_SCHEDULE_SOURCE.url, "https://mvhs.fuhsd.org/about-us/general-information/bell-schedule");
});
