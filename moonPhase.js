/*
  Pure lunar-phase data for Empyrean.

  This module deliberately has no browser, DOM, Three.js, storage, or gameplay
  dependencies. It answers two questions only:

    1. Where is a supplied real-world instant in the average lunar cycle?
    2. Which presentation orientation should a renderer use?

  Browser geolocation remains a later integration concern. Only the derived
  hemisphere string crosses into this module; latitude is never retained in a
  moon-state record.
*/

export const REFERENCE_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14, 0);
export const SYNODIC_MONTH_DAYS = 29.530588853;

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const NORTHERN_HEMISPHERE = "northern";
const SOUTHERN_HEMISPHERE = "southern";

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("Moon phase requires a valid date.");
  }

  return date;
}

export function normalizeMoonHemisphere(hemisphere) {
  return hemisphere === SOUTHERN_HEMISPHERE
    ? SOUTHERN_HEMISPHERE
    : NORTHERN_HEMISPHERE;
}

export function getMoonHemisphereFromLatitude(latitude) {
  /*
    Empyrean needs only the sign of latitude, not the coordinate itself.

    Zero is assigned to the northern presentation convention. Invalid,
    unavailable, and denied geolocation inputs share that same safe fallback.
  */
  return Number.isFinite(latitude) && latitude < 0
    ? SOUTHERN_HEMISPHERE
    : NORTHERN_HEMISPHERE;
}

export function getMoonPhaseName(phase) {
  const normalizedPhase = positiveModulo(phase, 1);

  /*
    These intentionally compact windows keep the four named landmarks centered
    on their calculated instants while crescents and gibbous phases cover the
    longer intervals between them.
  */
  if (normalizedPhase < 0.03 || normalizedPhase > 0.97) return "New Moon";
  if (normalizedPhase < 0.22) return "Waxing Crescent";
  if (normalizedPhase < 0.28) return "First Quarter";
  if (normalizedPhase < 0.47) return "Waxing Gibbous";
  if (normalizedPhase < 0.53) return "Full Moon";
  if (normalizedPhase < 0.72) return "Waning Gibbous";
  if (normalizedPhase < 0.78) return "Last Quarter";
  return "Waning Crescent";
}

export function getMoonLightSide(
  { waxing },
  hemisphere = NORTHERN_HEMISPHERE,
) {
  /*
    lightSide is a presentation hint, not the phase geometry. The future shader
    must use the continuous phase value to form the terminator curve.

    At exact new/full moon the side hint is visually irrelevant, but retaining
    one stable two-value contract avoids special states in every consumer.
  */
  const normalizedHemisphere = normalizeMoonHemisphere(hemisphere);

  if (normalizedHemisphere === SOUTHERN_HEMISPHERE) {
    return waxing ? "left" : "right";
  }

  return waxing ? "right" : "left";
}

export function getMoonPhase(
  currentDate = new Date(),
  hemisphere = NORTHERN_HEMISPHERE,
) {
  const normalizedDate = normalizeDate(currentDate);
  const normalizedHemisphere = normalizeMoonHemisphere(hemisphere);
  const daysSinceReference =
    (normalizedDate.getTime() - REFERENCE_NEW_MOON_UTC) / MS_PER_DAY;
  const moonAge = positiveModulo(daysSinceReference, SYNODIC_MONTH_DAYS);
  const phase = moonAge / SYNODIC_MONTH_DAYS;
  const illumination = 0.5 * (1 - Math.cos(2 * Math.PI * phase));
  const waxing = phase < 0.5;

  return Object.freeze({
    referenceDate: new Date(REFERENCE_NEW_MOON_UTC),
    currentDate: normalizedDate,
    moonAge,
    phase,
    illumination,
    phaseName: getMoonPhaseName(phase),
    waxing,
    hemisphere: normalizedHemisphere,
    lightSide: getMoonLightSide({ waxing }, normalizedHemisphere),
  });
}
