import assert from "node:assert/strict";
import test from "node:test";
import { minimumFinalScore } from "../src/mvhs/finals";

test("minimum final score uses the final's percentage of the course grade", () => {
  assert.equal(minimumFinalScore(92, 15, 90)?.toFixed(1), "78.7");
  assert.equal(minimumFinalScore(95, 15, 90)?.toFixed(2), "61.67");
});

test("minimum final score rejects impossible input domains", () => {
  assert.equal(minimumFinalScore(92, 0, 90), null);
  assert.equal(minimumFinalScore(92, 101, 90), null);
  assert.equal(minimumFinalScore(Number.NaN, 15, 90), null);
  assert.equal(minimumFinalScore(-1, 15, 90), null);
});

test("results below zero and above 100 remain explicit for honest UI messaging", () => {
  assert.ok((minimumFinalScore(100, 20, 70) ?? 0) < 0);
  assert.ok((minimumFinalScore(70, 10, 90) ?? 0) > 100);
});
