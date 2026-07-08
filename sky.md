# Empyrean Sky Gradient Cycle Update

## Goal

Implement a repeating sky-gradient day/night cycle with three vertical gradient color stops:

- Horizon
- Mid sky
- Zenith

The sky should start at night, remain night for 2 minutes, transition through a short “transition sky” phase, remain day for 2 minutes, then repeat forever.

The `G` key should still manually toggle between day and night, but it should use the same transition behavior and reset the automatic cycle timer.

---

## Sky Color States

### Night Colors

```js
const NIGHT_SKY = {
  horizon: "#091833",
  mid: "#102B5E",
  zenith: "#051545",
};
```

### Day Colors

```js
const DAY_SKY = {
  horizon: "#A0E7FB",
  mid: "#85E0FA",
  zenith: "#78DDFA",
};
```

### Transition Colors

```js
const TRANSITION_SKY = {
  horizon: "#FAB48C",
  mid: "#170266",
  zenith: "#051545",
};
```

Note: the transition zenith color should include the `#`: `#051545`.

---

## Timing Requirements

The automatic cycle should behave like this:

1. Start at night.
2. Hold night colors for 2 minutes.
3. Transition from night colors to transition colors over 1 second.
4. Hold transition colors for 5 seconds.
5. Transition from transition colors to day colors over 1 second.
6. Hold day colors for 2 minutes.
7. Transition from day colors to transition colors over 1 second.
8. Hold transition colors for 5 seconds.
9. Transition from transition colors to night colors over 1 second.
10. Repeat forever.

Suggested timing constants:

```js
const SKY_TIMING = {
  holdNight: 120000,
  holdDay: 120000,
  transitionToTransition: 1000,
  holdTransition: 5000,
  transitionToTarget: 1000,
};
```

---

## Manual Toggle Requirement

The `G` key should still toggle day/night manually.

When `G` is pressed:

- If the current target state is night, begin the transition cycle toward day.
- If the current target state is day, begin the transition cycle toward night.
- The manual toggle should not instantly snap the sky colors.
- It should use the same transition behavior:

```text
current colors → transition colors over 1 second
hold transition colors for 5 seconds
transition colors → target day/night colors over 1 second
```

After the manual transition completes, restart the automatic cycle timer from the newly reached state.

Example:

- If currently night and `G` is pressed:
  - Transition from current night colors to transition colors over 1 second.
  - Hold transition colors for 5 seconds.
  - Transition to day colors over 1 second.
  - Then hold day for 2 minutes before continuing the automatic cycle.

- If currently day and `G` is pressed:
  - Transition from current day colors to transition colors over 1 second.
  - Hold transition colors for 5 seconds.
  - Transition to night colors over 1 second.
  - Then hold night for 2 minutes before continuing the automatic cycle.

---

## Implementation Notes

Please implement this cleanly and avoid duplicating transition logic.

Create or update a sky-cycle controller that tracks:

- Current sky colors
- Current target state: `'day'` or `'night'`
- Whether an automatic or manual transition is currently running
- Timers/timeouts so they can be cancelled and restarted cleanly
- A reusable function for interpolating gradient colors over time

The system should be robust if `G` is pressed during an active transition:

- Cancel the current scheduled timers/animation if necessary.
- Use the current visible sky colors as the starting point.
- Begin a fresh transition cycle toward the opposite target state.
- Restart the automatic cycle after the manual transition completes.

Please preserve the existing sky gradient rendering method if one already exists. Only replace or modify the timing/state logic as needed.

---

## Acceptance Criteria

- The app starts in night mode using the night gradient.
- Night holds for 2 minutes.
- The sky transitions to the transition gradient over 1 second.
- The transition gradient holds for 5 seconds.
- The sky transitions to the day gradient over 1 second.
- Day holds for 2 minutes.
- The cycle repeats indefinitely.
- Pressing `G` manually toggles day/night using the same 1 second → 5 second hold → 1 second transition cycle.
- Pressing `G` resets the automatic cycle timer after the manual transition finishes.
- Pressing `G` during an active transition does not break the sky state or create overlapping timers.
