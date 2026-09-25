import type { JSDOM } from "jsdom";

type DomWindow = JSDOM["window"];

function installGlobal(name: string, value: unknown): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  if (descriptor && !descriptor.configurable && !descriptor.writable && !descriptor.set) return;
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: descriptor?.enumerable ?? false,
    writable: true,
    value,
  });
}

export function installDomGlobals(dom: JSDOM, additional: Record<string, unknown> = {}): void {
  const win = dom.window as DomWindow;
  const globals: Record<string, unknown> = {
    window: win,
    document: win.document,
    navigator: win.navigator,
    self: win,
    HTMLElement: win.HTMLElement,
    HTMLInputElement: win.HTMLInputElement,
    HTMLTextAreaElement: win.HTMLTextAreaElement,
    HTMLFormElement: win.HTMLFormElement,
    FormData: win.FormData,
    Event: win.Event,
    ...additional,
  };

  for (const [name, value] of Object.entries(globals)) installGlobal(name, value);
}
