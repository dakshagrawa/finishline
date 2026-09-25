import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { JSDOM } from "jsdom";
import { installDomGlobals } from "./dom-test-bootstrap";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});

installDomGlobals(dom);

dom.window.scrollTo = () => undefined;

const React = require("react") as typeof import("react");
const { cleanup, fireEvent, render, screen, waitFor } = require("@testing-library/react") as typeof import("@testing-library/react");
const ProjectWorkspace = require("../src/components/project-workspace").default as typeof import("../src/components/project-workspace").default;

const storagePrototype = Object.getPrototypeOf(dom.window.localStorage) as Storage;
const originalGetItem = storagePrototype.getItem;
const originalSetItem = storagePrototype.setItem;
const originalRemoveItem = storagePrototype.removeItem;

beforeEach(() => {
  storagePrototype.getItem = originalGetItem;
  storagePrototype.setItem = originalSetItem;
  storagePrototype.removeItem = originalRemoveItem;
  dom.window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  storagePrototype.getItem = originalGetItem;
  storagePrototype.setItem = originalSetItem;
  storagePrototype.removeItem = originalRemoveItem;
});

test("invalid intake focuses the first invalid field and reports exact enum errors", async () => {
  render(React.createElement(ProjectWorkspace));
  fireEvent.click(await screen.findByRole("button", { name: /start a new project/i }));

  const submit = await screen.findByRole("button", { name: /build my finish line/i });
  fireEvent.click(submit);

  const roughIdea = screen.getByLabelText(/rough idea/i);
  await waitFor(() => assert.equal(document.activeElement, roughIdea));
  assert.equal(roughIdea.getAttribute("aria-invalid"), "true");

  fireEvent.change(roughIdea, { target: { value: "Build a useful guide" } });
  fireEvent.change(screen.getByLabelText(/who is it for/i), { target: { value: "new students" } });
  fireEvent.change(screen.getByLabelText(/what should change/i), { target: { value: "Find support quickly" } });
  fireEvent.change(screen.getByLabelText(/skills and resources/i), { target: { value: "HTML" } });
  fireEvent.change(screen.getByLabelText(/hours per week/i), { target: { value: "0.5" } });

  const form = submit.closest("form");
  assert.ok(form);
  for (const radio of form.querySelectorAll('input[name="timeHorizon"], input[name="evidenceChoice"]')) {
    radio.remove();
  }
  const badHorizon = document.createElement("input");
  badHorizon.name = "timeHorizon";
  badHorizon.value = "21";
  form.append(badHorizon);
  const badEvidence = document.createElement("input");
  badEvidence.name = "evidenceChoice";
  badEvidence.value = "likes";
  form.append(badEvidence);
  fireEvent.click(submit);

  assert.match(screen.getByText(/enter between 1 and 168 hours/i).textContent ?? "", /1 and 168/);
  assert.match(screen.getByText(/choose a valid time horizon/i).textContent ?? "", /valid/);
  assert.match(screen.getByText(/choose valid proof of progress/i).textContent ?? "", /valid/);
});

test("a valid project is focused, persisted, and restored with checklist progress", async () => {
  render(React.createElement(ProjectWorkspace));
  fireEvent.click(await screen.findByRole("button", { name: /start a new project/i }));

  fireEvent.change(await screen.findByLabelText(/rough idea/i), { target: { value: "Build a useful guide" } });
  fireEvent.change(screen.getByLabelText(/who is it for/i), { target: { value: "new students" } });
  fireEvent.change(screen.getByLabelText(/what should change/i), { target: { value: "Find support quickly" } });
  fireEvent.change(screen.getByLabelText(/skills and resources/i), { target: { value: "HTML" } });
  fireEvent.change(screen.getByLabelText(/hours per week/i), { target: { value: "4" } });
  fireEvent.click(screen.getByLabelText("14 days"));
  fireEvent.click(screen.getByLabelText(/a demo/i));
  fireEvent.click(screen.getByRole("button", { name: /build my finish line/i }));

  const boardHeading = await screen.findByRole("heading", { name: "Build a useful guide" });
  await waitFor(() => assert.equal(document.activeElement, boardHeading));
  assert.ok(screen.getByRole("button", { name: /clear project & start fresh/i }));

  const firstMilestone = screen.getByRole("checkbox", { name: /define one testable promise/i });
  fireEvent.click(firstMilestone);
  assert.equal((firstMilestone as HTMLInputElement).checked, true);
  assert.match(dom.window.localStorage.getItem("finishline.project.v1") ?? "", /"milestoneDone":\[true/);

  cleanup();
  render(React.createElement(ProjectWorkspace));
  assert.ok(await screen.findByRole("heading", { name: "Build a useful guide" }));
  assert.equal((screen.getByRole("checkbox", { name: /define one testable promise/i }) as HTMLInputElement).checked, true);
});

test("a radio option receives focus when its group is the first invalid field", async () => {
  render(React.createElement(ProjectWorkspace));
  fireEvent.click(await screen.findByRole("button", { name: /start a new project/i }));

  fireEvent.change(await screen.findByLabelText(/rough idea/i), { target: { value: "Build a useful guide" } });
  fireEvent.change(screen.getByLabelText(/who is it for/i), { target: { value: "new students" } });
  fireEvent.change(screen.getByLabelText(/what should change/i), { target: { value: "Find support quickly" } });
  fireEvent.change(screen.getByLabelText(/skills and resources/i), { target: { value: "HTML" } });
  fireEvent.change(screen.getByLabelText(/hours per week/i), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: /build my finish line/i }));

  await waitFor(() => assert.equal(document.activeElement, screen.getByLabelText("7 days")));
});

test("storage failures keep the app usable and make the unsaved state truthful", async () => {
  storagePrototype.getItem = () => {
    throw new Error("blocked");
  };
  storagePrototype.setItem = () => {
    throw new Error("blocked");
  };
  storagePrototype.removeItem = () => {
    throw new Error("blocked");
  };

  render(React.createElement(ProjectWorkspace));

  assert.ok(await screen.findByRole("heading", { name: /create a welcoming school resource guide/i }));
  assert.ok(screen.getByRole("status", { name: /storage unavailable/i }));

  fireEvent.click(screen.getByRole("checkbox", { name: /define one testable promise/i }));
  assert.equal((screen.getByRole("checkbox", { name: /define one testable promise/i }) as HTMLInputElement).checked, true);
  assert.match(screen.getByRole("status", { name: /storage unavailable/i }).textContent ?? "", /not saved/i);

  fireEvent.click(screen.getByRole("button", { name: /start a new project/i }));
  assert.ok(await screen.findByRole("heading", { name: /what are you ready to finish/i }));
});
