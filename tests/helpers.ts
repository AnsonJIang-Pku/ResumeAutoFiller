import { JSDOM } from "jsdom";

export function domFromHtml(html: string, url = "https://jobs.example.test/app", runScripts: "dangerously" | undefined = undefined): JSDOM {
  const dom = new JSDOM(html, { url, runScripts, pretendToBeVisual: true });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    Event: dom.window.Event,
    InputEvent: dom.window.InputEvent,
    MutationObserver: dom.window.MutationObserver
  });
  return dom;
}
