import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import { installDomGlobals } from "./dom-test-bootstrap";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/tools" });
installDomGlobals(dom);

const React = require("react") as typeof import("react");
const { cleanup, fireEvent, render, screen } = require("@testing-library/react") as typeof import("@testing-library/react");
const MvhsTools = require("../src/mvhs/tools").default as typeof import("../src/mvhs/tools").default;

afterEach(cleanup);

test("finals calculator rejects blank numeric fields instead of treating them as zero", () => {
  render(React.createElement(MvhsTools));

  const current = screen.getByLabelText("Current grade");
  const target = screen.getByLabelText("Target grade");

  fireEvent.change(current, { target: { value: "" } });
  assert.match(screen.getByRole("status").textContent ?? "", /check your values/i);

  fireEvent.change(current, { target: { value: "92" } });
  fireEvent.change(target, { target: { value: "" } });
  assert.match(screen.getByRole("status").textContent ?? "", /check your values/i);
});
