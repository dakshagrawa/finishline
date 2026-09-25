import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { JSDOM } from "jsdom";
import { installDomGlobals } from "./dom-test-bootstrap";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/grades" });
installDomGlobals(dom);

const React = require("react") as typeof import("react");
const { cleanup, fireEvent, render, screen } = require("@testing-library/react") as typeof import("@testing-library/react");
const GradeCalculator = require("../src/grades/grade-calculator").default as typeof import("../src/grades/grade-calculator").default;

const validTemplate = JSON.stringify({
  version: 1,
  student: { name: "Ada", school: "MVHS" },
  courses: [
    { name: "Biology", period: "2", categories: [{ name: "Tests", weight: 1, assignments: [
      { title: "Midterm", score: 80, maxPoints: 100 },
      { title: "Dropped quiz", score: 0, maxPoints: 100, dropped: true },
    ] }] },
    { name: "English", period: "3", categories: [{ name: "Essays", weight: 1, assignments: [{ title: "Essay", score: 90, maxPoints: 100 }] }] },
  ],
});

const nativeSessionStorage = dom.window.sessionStorage;
const nativeFetch = globalThis.fetch;

beforeEach(() => {
  Object.defineProperty(dom.window, "sessionStorage", { configurable: true, value: nativeSessionStorage });
  nativeSessionStorage.clear();
  globalThis.fetch = (async () => new Response(JSON.stringify({
    available: false,
    connected: false,
    reason: "Schoology connection is awaiting district authorization and deployment configuration.",
  }), { headers: { "content-type": "application/json" } })) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = nativeFetch;
  cleanup();
});

test("malformed import stays local-entry while valid import opens the grade workspace", () => {
  render(React.createElement(GradeCalculator));
  const input = screen.getByLabelText(/gradebook json/i);
  fireEvent.change(input, { target: { value: "{bad" } });
  fireEvent.click(screen.getByRole("button", { name: /open gradebook/i }));
  assert.match(screen.getByRole("alert").textContent ?? "", /not valid json/i);
  assert.ok(screen.getByRole("heading", { name: /private what-if grades/i }));

  fireEvent.change(input, { target: { value: validTemplate } });
  fireEvent.click(screen.getByRole("button", { name: /open gradebook/i }));
  const dashboardHeading = screen.getByRole("heading", { name: "Biology" });
  assert.ok(dashboardHeading);
  assert.equal(document.activeElement, dashboardHeading);
  assert.match(screen.getByText(/imported data · react memory only/i).textContent ?? "", /memory/i);
});

test("score, maximum-point, and category-weight edits recalculate immediately", () => {
  render(React.createElement(GradeCalculator));
  fireEvent.change(screen.getByLabelText(/gradebook json/i), { target: { value: validTemplate } });
  fireEvent.click(screen.getByRole("button", { name: /open gradebook/i }));

  assert.ok(screen.getByText(/excluded · dropped/i));
  const droppedScore = screen.getByLabelText("Dropped quiz score") as HTMLInputElement;
  assert.equal(droppedScore.disabled, true);
  fireEvent.change(droppedScore, { target: { value: "100" } });
  assert.ok(screen.getByText("80.0% · B-"));
  const scoreSlider = screen.getByLabelText("Midterm score slider") as HTMLInputElement;
  assert.equal(scoreSlider.type, "range");
  fireEvent.change(scoreSlider, { target: { value: "90" } });
  assert.ok(screen.getByText("90.0% · A-"));

  fireEvent.change(screen.getByLabelText("Midterm score"), { target: { value: "100" } });
  assert.ok(screen.getByText("100.0% · A+"));
  fireEvent.change(screen.getByLabelText("Midterm score"), { target: { value: "" } });
  assert.ok(screen.getByText("— · —"));
  fireEvent.change(screen.getByLabelText("Midterm score"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Midterm maximum points"), { target: { value: "200" } });
  assert.ok(screen.getByText("50.0% · F"));
  const weight = screen.getByLabelText("Tests weight") as HTMLInputElement;
  fireEvent.change(weight, { target: { value: "0" } });
  assert.equal(weight.value, "1");
  assert.ok(screen.getByRole("status", { name: /invalid category weights/i }));
  assert.ok(screen.getByText("50.0% · F"));
});

test("simulations remain isolated by course while switching and can be renamed, edited, and removed", () => {
  render(React.createElement(GradeCalculator));
  fireEvent.change(screen.getByLabelText(/gradebook json/i), { target: { value: validTemplate } });
  fireEvent.click(screen.getByRole("button", { name: /open gradebook/i }));

  const biology = screen.getByRole("button", { name: /biology.*80.0%/i });
  const english = screen.getByRole("button", { name: /english.*90.0%/i });
  assert.equal(biology.getAttribute("aria-pressed"), "true");
  fireEvent.click(screen.getByRole("button", { name: /add simulation to tests/i }));
  fireEvent.change(screen.getByLabelText(/simulation name/i), { target: { value: "Final retake" } });
  fireEvent.change(screen.getByLabelText("Final retake score"), { target: { value: "120" } });
  assert.ok(screen.getByText("100.0% · A+"));

  fireEvent.click(english);
  assert.equal(english.getAttribute("aria-pressed"), "true");
  assert.equal(screen.queryByDisplayValue("Final retake"), null);
  fireEvent.click(biology);
  assert.ok(screen.getByDisplayValue("Final retake"));
  fireEvent.click(screen.getByRole("button", { name: /remove final retake/i }));
  assert.equal(screen.queryByDisplayValue("Final retake"), null);
  assert.ok(screen.getByText("80.0% · B-"));
});

test("corrupted saved demo data is cleared without falsely reporting a storage failure", () => {
  nativeSessionStorage.setItem("finishline.grades.demo.v1", "{bad");

  render(React.createElement(GradeCalculator));

  assert.ok(screen.getByRole("heading", { name: /private what-if grades/i }));
  assert.equal(nativeSessionStorage.getItem("finishline.grades.demo.v1"), null);
  assert.equal(screen.queryByText(/storage unavailable/i), null);
});

test("Schoology connection stays visibly gated while district authorization is unavailable", async () => {
  render(React.createElement(GradeCalculator));
  assert.ok(await screen.findByText(/awaiting district authorization/i));
  assert.equal(screen.queryByRole("button", { name: /continue with schoology/i }), null);
  assert.ok(screen.getByRole("button", { name: /open gradebook/i }));
});

test("authorized Schoology connection loads normalized grades into memory and can disconnect", async () => {
  const schoologyGradebook = {
    version: 1,
    source: "schoology",
    student: { name: "Ada", school: "MVHS" },
    courses: [{ id: "course-1", name: "Biology", period: "2", teacher: "", categories: [{ name: "Tests", weight: 1, assignments: [{ id: "c1-g1-a1", title: "Midterm", score: 90, maxPoints: 100, dropped: false }] }] }],
  };
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith("/status")) return Response.json({ available: true, connected: true });
    if (url.endsWith("/gradebook")) return Response.json(schoologyGradebook);
    if (url.endsWith("/logout") && init?.method === "POST") return Response.json({ connected: false });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  render(React.createElement(GradeCalculator));
  fireEvent.click(await screen.findByRole("button", { name: /load schoology grades/i }));
  assert.ok(await screen.findByRole("heading", { name: "Biology" }));
  assert.ok(screen.getByText(/schoology data · react memory only/i));
  fireEvent.click(screen.getByRole("button", { name: /disconnect schoology/i }));
  assert.ok(await screen.findByRole("heading", { name: /private what-if grades/i }));
});

test("expired Schoology authorization offers explicit reconnect without retrying grade loading", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/status")) return Response.json({ available: true, connected: true });
    if (url.endsWith("/gradebook")) return Response.json(
      { error: "Schoology authorization is unavailable or expired." },
      { status: 401 },
    );
    return new Response(null, { status: 404 });
  }) as typeof fetch;

  render(React.createElement(GradeCalculator));
  fireEvent.click(await screen.findByRole("button", { name: /load schoology grades/i }));

  assert.match((await screen.findByRole("alert")).textContent ?? "", /unavailable or expired/i);
  assert.ok(screen.getByRole("button", { name: /continue with schoology/i }));
  assert.equal(screen.queryByRole("button", { name: /load schoology grades/i }), null);
  assert.deepEqual(requests.map((url) => new URL(url, "http://localhost").pathname), [
    "/api/integrations/schoology/status",
    "/api/integrations/schoology/gradebook",
  ]);
});

test("demo rejects an unrestorable final-zero weight, restores on remount, and manages focus", () => {
  render(React.createElement(GradeCalculator));
  fireEvent.click(screen.getByRole("button", { name: /explore demo/i }));

  const dashboardHeading = screen.getByRole("heading", { name: "AP Calculus BC" });
  assert.equal(document.activeElement, dashboardHeading);
  const weight = screen.getByLabelText("Tests weight") as HTMLInputElement;
  fireEvent.change(weight, { target: { value: "0" } });
  assert.equal(weight.value, "1");

  cleanup();
  render(React.createElement(GradeCalculator));
  assert.ok(screen.getByRole("heading", { name: "AP Calculus BC" }));

  fireEvent.click(screen.getByRole("button", { name: /reset grade lab/i }));
  const entryHeading = screen.getByRole("heading", { name: /private what-if grades/i });
  assert.equal(document.activeElement, entryHeading);
});

test("demo GPA is honestly labeled and storage failures never block use or reset", () => {
  Object.defineProperty(dom.window, "sessionStorage", {
    configurable: true,
    value: {
      getItem() { return null; },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    },
  });

  render(React.createElement(GradeCalculator));
  fireEvent.click(screen.getByRole("button", { name: /explore demo/i }));

  assert.ok(screen.getByRole("heading", { name: "AP Calculus BC" }));
  assert.ok(screen.getByText("Unweighted what-if GPA"));
  assert.ok(screen.getByText("4.00"));
  assert.match(screen.getByText(/courses with calculated grades/i).textContent ?? "", /^2 courses/);
  assert.ok(screen.getByRole("status", { name: /storage unavailable/i }));

  fireEvent.click(screen.getByRole("button", { name: /reset grade lab/i }));
  assert.ok(screen.getByRole("heading", { name: /private what-if grades/i }));
  assert.ok(screen.getByText(/demo not saved/i));
});
