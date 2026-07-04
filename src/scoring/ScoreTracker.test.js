// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createScoreTracker, SCORE_BEST_KEY } from './ScoreTracker.js';

function createBike({ speed = 0, slopeSin = 0, yaw = 0, hardLanding = false, grounded = true } = {}) {
  return {
    speed,
    slopeSin,
    yaw,
    hardLanding,
    grounded,
    isGrounded() {
      return this.grounded;
    },
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('ScoreTracker flow score', () => {
  it('accumulates proportional to speed at combo x1', () => {
    const tracker = createScoreTracker();
    const bike = createBike({ speed: 10 });

    tracker.update(1, bike, 'grass');

    expect(tracker.score).toBeCloseTo(15); // 10 * SPEED_SCORE_RATE(1.5) * 1 * 1 * 1 * 1s
  });

  it('scores more while descending a steep slope than on the flat at equal speed', () => {
    const flatTracker = createScoreTracker();
    const descendingTracker = createScoreTracker();

    flatTracker.update(1, createBike({ speed: 10, slopeSin: 0 }), 'grass');
    descendingTracker.update(1, createBike({ speed: 10, slopeSin: 0.5 }), 'grass');

    expect(descendingTracker.score).toBeGreaterThan(flatTracker.score);
  });

  it('scores more over rock/heather than over grass at equal speed', () => {
    const grassTracker = createScoreTracker();
    const rockTracker = createScoreTracker();
    const heatherTracker = createScoreTracker();

    grassTracker.update(1, createBike({ speed: 10 }), 'grass');
    rockTracker.update(1, createBike({ speed: 10 }), 'rock');
    heatherTracker.update(1, createBike({ speed: 10 }), 'heather');

    expect(rockTracker.score).toBeGreaterThan(grassTracker.score);
    expect(heatherTracker.score).toBeGreaterThan(grassTracker.score);
  });
});

describe('ScoreTracker jumps', () => {
  it('awards air score and bumps the combo on a clean landing after sufficient airtime', () => {
    const tracker = createScoreTracker();
    const bike = createBike({ speed: 0, grounded: false });

    for (let i = 0; i < 4; i += 1) tracker.update(0.1, bike, 'grass'); // 0.4s airborne

    bike.grounded = true;
    bike.hardLanding = false;
    const events = tracker.update(0.1, bike, 'grass');

    expect(tracker.comboMultiplier).toBe(2);
    expect(tracker.score).toBeGreaterThan(0);
    expect(events.some((event) => event.label.includes('BIG AIR'))).toBe(true);
  });

  it('ignores tiny hops shorter than the minimum airtime', () => {
    const tracker = createScoreTracker();
    const bike = createBike({ speed: 0, grounded: false });

    tracker.update(0.05, bike, 'grass'); // well under MIN_AIR_TIME

    bike.grounded = true;
    const events = tracker.update(0.05, bike, 'grass');

    expect(tracker.comboMultiplier).toBe(1);
    expect(events).toHaveLength(0);
  });

  it('awards no air score on a hard landing, resets combo, and applies a combo-scaled penalty without going negative', () => {
    const tracker = createScoreTracker();
    const bike = createBike({ speed: 0, grounded: false });

    // First cycle: clean landing builds a combo of x2.
    for (let i = 0; i < 4; i += 1) tracker.update(0.1, bike, 'grass');
    bike.grounded = true;
    tracker.update(0.1, bike, 'grass');
    expect(tracker.comboMultiplier).toBe(2);
    const scoreBeforeCrash = tracker.score;

    // Second cycle: hard landing should forfeit the combo and dock points.
    bike.grounded = false;
    for (let i = 0; i < 4; i += 1) tracker.update(0.1, bike, 'grass');
    bike.grounded = true;
    bike.hardLanding = true;
    const events = tracker.update(0.1, bike, 'grass');

    expect(tracker.comboMultiplier).toBe(1);
    expect(tracker.score).toBeCloseTo(scoreBeforeCrash - 50); // CRASH_PENALTY_PER_COMBO * (2 - 1)
    expect(tracker.score).toBeGreaterThanOrEqual(0);
    expect(events.some((event) => event.label.includes('BAIL'))).toBe(true);
  });

  it('never lets score go negative even when the penalty would exceed it', () => {
    const tracker = createScoreTracker();
    const bike = createBike({ speed: 0, grounded: false });

    // Build combo up to x5 via cheap, minimal-airtime clean landings.
    for (let cycle = 0; cycle < 4; cycle += 1) {
      bike.grounded = false;
      tracker.update(0.3, bike, 'grass');
      bike.grounded = true;
      bike.hardLanding = false;
      tracker.update(0.05, bike, 'grass');
    }
    expect(tracker.comboMultiplier).toBe(5);

    bike.grounded = false;
    tracker.update(0.3, bike, 'grass');
    bike.grounded = true;
    bike.hardLanding = true;
    tracker.update(0.05, bike, 'grass');

    expect(tracker.score).toBeGreaterThanOrEqual(0);
  });
});

describe('ScoreTracker turns', () => {
  it('awards turn score and bumps the combo after a sustained fast turn', () => {
    const tracker = createScoreTracker();
    const bike = createBike({ speed: 10, yaw: 0 });

    tracker.update(0.1, bike, 'grass'); // prime previousYaw, no turn yet

    for (let i = 0; i < 5; i += 1) {
      bike.yaw += 0.2; // yawRate = 2 rad/s, well above TURN_SCORE_MIN_RATE
      tracker.update(0.1, bike, 'grass');
    }

    // Turn ends: yaw stops changing, so the accumulated turn (>= TURN_SCORE_MIN_ANGLE) pays out.
    const events = tracker.update(0.1, bike, 'grass');

    expect(tracker.comboMultiplier).toBe(2);
    expect(events.some((event) => event.label.includes('TIGHT TURN'))).toBe(true);
  });

  it('does not award a turn below the minimum angle or below the minimum speed', () => {
    const tracker = createScoreTracker();
    const bike = createBike({ speed: 1, yaw: 0 }); // below TURN_SCORE_MIN_SPEED

    tracker.update(0.1, bike, 'grass');
    for (let i = 0; i < 5; i += 1) {
      bike.yaw += 0.2;
      tracker.update(0.1, bike, 'grass');
    }
    const events = tracker.update(0.1, bike, 'grass');

    expect(tracker.comboMultiplier).toBe(1);
    expect(events.some((event) => event.label.includes('TIGHT TURN'))).toBe(false);
  });
});

describe('ScoreTracker combo decay', () => {
  it('decays back to x1 after the combo timeout with no new trick', () => {
    const tracker = createScoreTracker();
    const bike = createBike({ speed: 0, grounded: false });

    for (let i = 0; i < 4; i += 1) tracker.update(0.1, bike, 'grass');
    bike.grounded = true;
    tracker.update(0.1, bike, 'grass');
    expect(tracker.comboMultiplier).toBe(2);

    for (let i = 0; i < 50; i += 1) tracker.update(0.1, bike, 'grass'); // 5s, no new trick

    expect(tracker.comboMultiplier).toBe(1);
  });
});

describe('ScoreTracker best score persistence', () => {
  it('starts at 0 with no prior localStorage value', () => {
    const tracker = createScoreTracker();
    expect(tracker.bestScore).toBe(0);
  });

  it('updates and persists bestScore only when the running score exceeds it', () => {
    const tracker = createScoreTracker();
    tracker.update(1, createBike({ speed: 10 }), 'grass');
    const scoreAfterFirstUpdate = tracker.score;

    expect(tracker.bestScore).toBeCloseTo(scoreAfterFirstUpdate);
    expect(Number(localStorage.getItem(SCORE_BEST_KEY))).toBeCloseTo(scoreAfterFirstUpdate, 0);

    const freshTracker = createScoreTracker();
    expect(freshTracker.bestScore).toBeCloseTo(scoreAfterFirstUpdate, 0);
  });

  it('reset() zeroes score and combo but leaves bestScore untouched', () => {
    const tracker = createScoreTracker();
    tracker.update(1, createBike({ speed: 10 }), 'grass');
    const bestBeforeReset = tracker.bestScore;

    tracker.reset();

    expect(tracker.score).toBe(0);
    expect(tracker.comboMultiplier).toBe(1);
    expect(tracker.bestScore).toBe(bestBeforeReset);
  });
});
