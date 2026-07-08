import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
  Empyrean is browser-native and intentionally has no package.json declaring
  Node's module mode. Loading the pure browser module through a data URL lets
  this deterministic verification run without changing the runtime project.
*/
const sourceUrl = new URL("./moonPhase.js", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(sourceText).toString("base64")}`;
const {
  REFERENCE_NEW_MOON_UTC,
  SYNODIC_MONTH_DAYS,
  getMoonHemisphereFromLatitude,
  getMoonLightSide,
  getMoonPhase,
  getMoonPhaseName,
  normalizeMoonHemisphere,
} = await import(moduleUrl);

const MS_PER_DAY = 1000 * 60 * 60 * 24;
// Date stores whole milliseconds, so derived phase values cannot be exact reals.
const EPSILON = 1e-9;

function dateAtPhase(phase) {
  return new Date(
    REFERENCE_NEW_MOON_UTC + phase * SYNODIC_MONTH_DAYS * MS_PER_DAY,
  );
}

function approximatelyEqual(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

const newMoon = getMoonPhase(new Date(REFERENCE_NEW_MOON_UTC), "northern");
approximatelyEqual(newMoon.phase, 0, "reference phase");
approximatelyEqual(newMoon.illumination, 0, "new-moon illumination");
assert.equal(newMoon.phaseName, "New Moon");
assert.equal(newMoon.waxing, true);
assert.equal(newMoon.lightSide, "right");

const firstQuarter = getMoonPhase(dateAtPhase(0.25), "northern");
approximatelyEqual(firstQuarter.phase, 0.25, "first-quarter phase");
approximatelyEqual(firstQuarter.illumination, 0.5, "first-quarter illumination");
assert.equal(firstQuarter.phaseName, "First Quarter");
assert.equal(firstQuarter.lightSide, "right");

const fullMoon = getMoonPhase(dateAtPhase(0.5), "southern");
approximatelyEqual(fullMoon.phase, 0.5, "full-moon phase");
approximatelyEqual(fullMoon.illumination, 1, "full-moon illumination");
assert.equal(fullMoon.phaseName, "Full Moon");
assert.equal(fullMoon.waxing, fullMoon.phase < 0.5);
assert.equal(fullMoon.lightSide, fullMoon.waxing ? "left" : "right");

const lastQuarter = getMoonPhase(dateAtPhase(0.75), "northern");
approximatelyEqual(lastQuarter.phase, 0.75, "last-quarter phase");
approximatelyEqual(lastQuarter.illumination, 0.5, "last-quarter illumination");
assert.equal(lastQuarter.phaseName, "Last Quarter");
assert.equal(lastQuarter.lightSide, "left");

const beforeReference = getMoonPhase(dateAtPhase(-0.25), "northern");
approximatelyEqual(beforeReference.phase, 0.75, "negative-date wrapping");
assert.equal(beforeReference.phaseName, "Last Quarter");

assert.equal(getMoonPhaseName(1.125), "Waxing Crescent");
assert.equal(getMoonPhaseName(-0.25), "Last Quarter");
assert.equal(getMoonLightSide({ waxing: true }, "southern"), "left");
assert.equal(getMoonLightSide({ waxing: false }, "southern"), "right");
assert.equal(normalizeMoonHemisphere("southern"), "southern");
assert.equal(normalizeMoonHemisphere("equatorial"), "northern");
assert.equal(getMoonHemisphereFromLatitude(40.7128), "northern");
assert.equal(getMoonHemisphereFromLatitude(-33.8688), "southern");
assert.equal(getMoonHemisphereFromLatitude(0), "northern");
assert.equal(getMoonHemisphereFromLatitude(undefined), "northern");

const suppliedDate = dateAtPhase(0.125);
const clonedDateState = getMoonPhase(suppliedDate);
assert.notEqual(clonedDateState.currentDate, suppliedDate);
assert.equal(clonedDateState.currentDate.getTime(), suppliedDate.getTime());
assert.deepEqual(Object.keys(clonedDateState), [
  "referenceDate",
  "currentDate",
  "moonAge",
  "phase",
  "illumination",
  "phaseName",
  "waxing",
  "hemisphere",
  "lightSide",
]);
assert.equal(Object.isFrozen(clonedDateState), true);
assert.throws(() => getMoonPhase(new Date("invalid")), /valid date/);

console.info("Moon phase contract verification passed.");
