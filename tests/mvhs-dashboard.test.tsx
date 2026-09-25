import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import { installDomGlobals } from "./dom-test-bootstrap";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
installDomGlobals(dom);

const React = require("react") as typeof import("react");
const { renderToString } = require("react-dom/server") as typeof import("react-dom/server");
const { cleanup, fireEvent, render, screen } = require("@testing-library/react") as typeof import("@testing-library/react");
const MvhsDashboard = require("../src/mvhs/dashboard").default as typeof import("../src/mvhs/dashboard").default;

afterEach(cleanup);

test("dashboard presents an MVHS navigation shell and truthful pre-term status", () => {
  render(React.createElement(MvhsDashboard, { initialNow: new Date("2026-08-06T19:00:00Z") }));

  assert.ok(screen.getByRole("heading", { name: /good afternoon/i }));
  assert.ok(screen.getByText(/no school today/i));
  assert.ok(screen.getByText(/before the first day/i));
  assert.ok(screen.getAllByText(/august 17/i).length >= 1);
  assert.ok(screen.getByText("Key dates"));
  assert.equal(screen.queryByText("Coming up"), null);

  for (const [name, href] of [
    ["Home", "/"],
    ["Grade Lab", "/grades"],
    ["Clubs", "/clubs"],
    ["Tools", "/tools"],
    ["Projects", "/projects"],
    ["Settings", "/settings"],
  ]) {
    const link = screen.getByRole("link", { name: new RegExp(`^${name}$`, "i") });
    assert.equal(link.getAttribute("href"), href);
  }

  assert.equal(screen.getByRole("link", { name: /^Home$/i }).getAttribute("aria-current"), "page");
  assert.ok(screen.getByRole("link", { name: /official mvhs bell schedules/i }));
  assert.match(screen.getByText(/unofficial student dashboard/i).textContent ?? "", /unofficial/i);
});

test("dashboard renders the regular-day timeline and next-period countdown", () => {
  render(React.createElement(MvhsDashboard, { initialNow: new Date("2026-08-18T17:02:00Z") }));

  assert.ok(screen.getByRole("heading", { name: /tuesday \/ thursday regular schedule/i }));
  assert.ok(screen.getByText(/period 2 starts in 3 min/i));
  assert.equal(screen.getAllByText("Period 1").length, 1);
  assert.equal(screen.getAllByText("Period 7").length, 1);
});

test("dashboard date controls browse the verified school-year schedule and return to today", () => {
  render(React.createElement(MvhsDashboard, { initialNow: new Date("2026-08-18T17:02:00Z") }));

  fireEvent.click(screen.getByRole("button", { name: /next day/i }));
  assert.ok(screen.getByRole("heading", { name: /wednesday \/ friday regular schedule/i }));
  assert.ok(screen.getAllByText(/wednesday, august 19, 2026/i).length >= 1);

  fireEvent.click(screen.getByRole("button", { name: /today/i }));
  assert.ok(screen.getByRole("heading", { name: /tuesday \/ thursday regular schedule/i }));
  assert.ok(screen.getAllByText(/tuesday, august 18, 2026/i).length >= 1);
});

test("dashboard server output is hydration-stable before the browser clock starts", () => {
  const html = renderToString(React.createElement(MvhsDashboard));
  assert.match(html, /Loading local schedule/i);
  assert.doesNotMatch(html, /Current Monta Vista time/i);
});
