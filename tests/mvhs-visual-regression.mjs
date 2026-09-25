// Run after `npm run build`; launches its own loopback Next server and Playwright Chromium.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { chromium } from "playwright";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  server.close();
  await once(server, "close");
  return port;
}

async function waitForServer(url, child) {
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw Error(`Next server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
      throw Error(`Next server returned HTTP ${response.status}`);
    } catch (error) {
      if (!/fetch failed|timed out|aborted/i.test(String(error))) throw error;
    }
    await delay(200);
  }
  throw Error(`Next server did not become ready at ${url}`);
}

function luminance(color) {
  const components = color.match(/[\d.]+/g).slice(0, 3).map((number) => Number(number) / 255);
  return components.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

let server;
let browser;
let serverExit;
try {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  serverExit = new Promise((resolve) => {
    server.once("exit", resolve);
    server.once("error", resolve);
  });
  await waitForServer(base, server);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  });
  const page = await browser.newPage();
  const forbiddenRequests = [];
  // Only local pages and assets are allowed; never request Schoology integration or external services.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base && !url.pathname.startsWith("/api/integrations/schoology")) return route.continue();
    forbiddenRequests.push(url.href);
    return route.abort();
  });
  for (const viewport of [320, 375, 800, 1280]) {
    await page.setViewportSize({ width: viewport, height: 850 });
    await page.goto(`${base}/tools`, { waitUntil: "load" });
    await page.locator(".mvhs-main-nav a").first().waitFor();
    const tools = await page.evaluate(() => {
      const labels = [...document.querySelectorAll(".mvhs-tool-fields label")];
      const suffix = labels[0]?.querySelector("span");
      const cue = document.querySelector(".mvhs-mobile-unofficial");
      const brand = document.querySelector(".mvhs-unofficial-badge");
      const nav = document.querySelector(".mvhs-main-nav");
      return { labels: labels.map((el) => getComputedStyle(el).color), suffix: getComputedStyle(suffix).color,
        card: getComputedStyle(labels[0].closest(".mvhs-card")).backgroundColor,
        cue: cue.textContent, cueDisplay: getComputedStyle(cue).display, cueColor: getComputedStyle(cue).color,
        mainBackground: getComputedStyle(document.querySelector(".mvhs-app-shell")).backgroundColor,
        brandDisplay: getComputedStyle(brand.closest(".mvhs-brand")).display,
        navPosition: getComputedStyle(document.querySelector(".mvhs-sidebar")).position,
        navRows: new Set([...nav.children].map((el) => Math.round(el.getBoundingClientRect().top))).size,
        cueAboveHeader: cue.getBoundingClientRect().bottom <= document.querySelector(".mvhs-section-header").getBoundingClientRect().top,
        docWidth: document.documentElement.scrollWidth, viewport: innerWidth };
    });
    assert.equal(tools.labels.length, 3);
    for (const text of [...tools.labels, tools.suffix]) assert.ok(contrast(text, tools.card) >= 4.5, `tool label contrast ${contrast(text, tools.card)} at ${viewport}`);
    assert.ok(tools.docWidth <= tools.viewport, `horizontal overflow at ${viewport}`);
    if (viewport <= 820) {
      assert.equal(tools.cueDisplay, "block");
      assert.match(tools.cue, /not affiliated with FUHSD/);
      assert.ok(tools.cueAboveHeader);
      assert.ok(contrast(tools.cueColor, tools.mainBackground) >= 4.5);
      assert.equal(tools.brandDisplay, "none");
    } else { assert.equal(tools.cueDisplay, "none"); assert.notEqual(tools.brandDisplay, "none"); }
    assert.equal(tools.navPosition, viewport <= 760 ? "fixed" : viewport <= 820 ? "static" : "sticky");
    assert.equal(tools.navRows, viewport <= 350 ? 2 : viewport <= 820 ? 1 : 6);
    await page.goto(base, { waitUntil: "load" });
    await page.locator(".mvhs-date-controls button").first().waitFor();
    for (let n = 0; n < 8 && !(await page.locator(".mvhs-no-school").count()); n++) {
      await page.getByRole("button", { name: "Next day" }).click();
    }
    await page.locator(".mvhs-no-school strong").waitFor();
    const noSchool = await page.evaluate(() => {
      const panel = document.querySelector(".mvhs-no-school");
      return { strong: getComputedStyle(panel.querySelector("strong")).color,
        note: getComputedStyle(panel.querySelector("p")).color,
        background: getComputedStyle(panel).backgroundImage };
    });
    const stops = [...noSchool.background.matchAll(/rgb\([^)]*\)/g)].map((match) => match[0]);
    assert.equal(stops.length, 2, `expected two gradient stops: ${noSchool.background}`);
    for (const text of [noSchool.strong, noSchool.note]) for (const stop of stops)
      assert.ok(contrast(text, stop) >= 4.5, `no-school contrast ${contrast(text, stop)} at ${viewport}`);
    assert.deepEqual(forbiddenRequests, [], `unexpected external or Schoology requests at ${viewport}`);
    console.log(`${viewport}px: tools ${contrast(tools.labels[0], tools.card).toFixed(2)}:1; suffix ${contrast(tools.suffix, tools.card).toFixed(2)}:1; cue ${viewport <= 820 ? contrast(tools.cueColor, tools.mainBackground).toFixed(2) : "desktop badge"}:1; no-school strong ${stops.map((stop) => contrast(noSchool.strong, stop).toFixed(2)).join("/")}:1; note ${stops.map((stop) => contrast(noSchool.note, stop).toFixed(2)).join("/")}:1; nav rows ${tools.navRows}`);
  }
} finally {
  try {
    await browser?.close();
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      server.kill("SIGTERM");
      await Promise.race([serverExit, delay(5000)]);
      if (server.exitCode === null && server.signalCode === null) {
        server.kill("SIGKILL");
        await serverExit;
      }
    }
  }
}
