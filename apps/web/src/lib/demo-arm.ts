import { track } from "./metrics";

/**
 * VD1 (spec 2026-11-07): half of the visits landing on an upload-limit page see
 * a demo loop in the hero, the other half see the page as it was. The arm is
 * drawn on the server per request and arrives in the HTML through the route's
 * loader, so nothing moves after load and nothing is stored: no id, no cookie.
 * The price is that someone who reloads can see both arms.
 */
export type DemoArm = "video" | "control";
export type DemoCut = "claude" | "chatgpt";
export interface Demo {
  arm: DemoArm;
  cut: DemoCut;
}

/**
 * The pages in the test and the cut each shows (`/demo/<cut>.mp4`). A page
 * goes in here in the same commit as its clip; until then its loader draws
 * nothing and the page renders as before.
 */
export const VD1_CUTS: Readonly<Record<string, DemoCut>> = {};

/** The demo box's own CSS condition. A visit outside it never sees the box, so it is not in the read. */
export const DEMO_MEDIA = "(pointer: fine) and (min-width: 1024px)";

export function pickArm(unit: number): DemoArm {
  return unit < 0.5 ? "video" : "control";
}

function randomUnit(): number {
  const byte = new Uint8Array(1);
  crypto.getRandomValues(byte);
  return byte[0] / 256;
}

// Browser only: the arm this page load was drawn into. A Worker isolate serves
// many requests, so the server never keeps one.
let loadArm: DemoArm | undefined;

/**
 * The route loader's value. On the server it draws; in the browser (a hover
 * preload or a client navigation) it hands back the arm the landing page
 * brought, so moving between two pages in the test never re-draws, and a visit
 * that landed elsewhere stays out of it.
 */
export function demoFor(path: string, cuts = VD1_CUTS, draw = randomUnit): Demo | null {
  const cut = cuts[path];
  if (!cut) return null;
  if (import.meta.env.SSR) return { arm: pickArm(draw()), cut };
  return loadArm ? { arm: loadArm, cut } : null;
}

let armRecorded = false;
let playRecorded = false;

/** Called by the page once hydrated: keeps the arm for this load and counts it once. */
export function settleDemoArm(arm: DemoArm): void {
  loadArm ??= arm;
  if (armRecorded) return;
  armRecorded = true;
  if (typeof matchMedia === "function" && matchMedia(DEMO_MEDIA).matches) track("demo_arm", arm);
}

export function recordDemoPlay(): void {
  if (playRecorded) return;
  playRecorded = true;
  track("demo_play", "start");
}

/** Test hook: a fresh page load. */
export function resetDemoArmForTest(): void {
  loadArm = undefined;
  armRecorded = false;
  playRecorded = false;
}
