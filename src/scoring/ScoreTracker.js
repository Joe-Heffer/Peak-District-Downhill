// THPS-style scoring: a continuous "flow" score from speed/slope/terrain, lump-sum
// payouts for jumps and tight turns, and a combo multiplier that chains those payouts
// together but resets — with a penalty — on a hard landing. See CLAUDE.md/plan notes
// for the design rationale.

const SPEED_SCORE_RATE = 1.5; // points per (m/s) of ground speed, per second
const DOWNHILL_BONUS_SCALE = 1.0; // extra flow-score fraction at full descending slopeSin
const TERRAIN_BONUS = {
  rock: 1.5,
  heather: 1.3,
  wood: 1.1,
  track: 1.0,
  grass: 1.0,
};

const MIN_AIR_TIME = 0.3; // s — ignore tiny hops
const AIR_SCORE_RATE = 200; // points per second of airtime

const TURN_SCORE_MIN_RATE = 1.0; // rad/s — yaw rate that counts as "carving"
const TURN_SCORE_MIN_SPEED = 3; // m/s — must be moving to score a turn
const TURN_SCORE_MIN_ANGLE = 0.9; // rad (~52 deg) — minimum accumulated turn to pay out
const TURN_SCORE_RATE = 150; // points per TURN_SCORE_MIN_ANGLE of accumulated turn

const MAX_COMBO = 5;
const COMBO_TIMEOUT = 4; // s since the last trick before the combo decays to x1
const CRASH_PENALTY_PER_COMBO = 50; // points lost per combo level forfeited on a crash

const DISPLAY_EASE_RATE = 6; // 1/s — displayScore's catch-up speed toward score

export const SCORE_BEST_KEY = 'bestScore';

export function createScoreTracker() {
  let score = 0;
  let displayScore = 0;
  let bestScore = Number(localStorage.getItem(SCORE_BEST_KEY)) || 0;
  let comboMultiplier = 1;
  let comboTimer = 0;

  let wasGrounded = true;
  let airTimeAccum = 0;

  let turnAccum = 0;
  let previousYaw = null;

  function registerTrick(basePoints, label) {
    const amount = basePoints * comboMultiplier;
    score += amount;
    comboMultiplier = Math.min(comboMultiplier + 1, MAX_COMBO);
    comboTimer = 0;
    return { label, amount };
  }

  function endTurn(events) {
    if (turnAccum >= TURN_SCORE_MIN_ANGLE) {
      const basePoints = TURN_SCORE_RATE * (turnAccum / TURN_SCORE_MIN_ANGLE);
      const event = registerTrick(basePoints, 'TIGHT TURN');
      events.push({ label: `+${Math.round(event.amount)} ${event.label}`, amount: event.amount });
    }
    turnAccum = 0;
  }

  return {
    get score() {
      return score;
    },
    get displayScore() {
      return displayScore;
    },
    get bestScore() {
      return bestScore;
    },
    get comboMultiplier() {
      return comboMultiplier;
    },

    update(dt, bike, landcoverClass) {
      const events = [];

      // Combo decay: no trick landed within the timeout window drops it back to x1.
      comboTimer += dt;
      if (comboTimer > COMBO_TIMEOUT) comboMultiplier = 1;

      // Continuous flow score: speed, weighted by descent steepness and terrain type.
      const downhillFactor = 1 + Math.max(0, bike.slopeSin) * DOWNHILL_BONUS_SCALE;
      const terrainFactor = TERRAIN_BONUS[landcoverClass] ?? 1.0;
      score += bike.speed * SPEED_SCORE_RATE * downhillFactor * terrainFactor * comboMultiplier * dt;

      // Turn tracking, independent of grounded/airborne transitions below.
      const grounded = bike.isGrounded();
      if (previousYaw !== null && dt > 0) {
        const yawRate = (bike.yaw - previousYaw) / dt;
        if (Math.abs(yawRate) > TURN_SCORE_MIN_RATE && grounded && bike.speed > TURN_SCORE_MIN_SPEED) {
          turnAccum += Math.abs(bike.yaw - previousYaw);
        } else if (turnAccum > 0) {
          endTurn(events);
        }
      }
      previousYaw = bike.yaw;

      // Airborne/landing tracking — deliberately separate from bike.wasGrounded, which
      // gets overwritten inside bike.syncAfterStep() before this can read it.
      if (!grounded) {
        airTimeAccum += dt;
      } else if (!wasGrounded) {
        const airTime = airTimeAccum;
        airTimeAccum = 0;
        if (bike.hardLanding) {
          if (turnAccum > 0) endTurn(events);
          const penalty = CRASH_PENALTY_PER_COMBO * (comboMultiplier - 1);
          if (penalty > 0) {
            score = Math.max(0, score - penalty);
            events.push({ label: `-${penalty} BAIL`, amount: -penalty });
          }
          comboMultiplier = 1;
          comboTimer = 0;
        } else if (airTime >= MIN_AIR_TIME) {
          const basePoints = AIR_SCORE_RATE * airTime;
          const event = registerTrick(basePoints, 'BIG AIR');
          events.push({ label: `+${Math.round(event.amount)} ${event.label}`, amount: event.amount });
        }
      }
      wasGrounded = grounded;

      displayScore += (score - displayScore) * Math.min(1, DISPLAY_EASE_RATE * dt);
      if (Math.abs(score - displayScore) < 0.5) displayScore = score;

      if (score > bestScore) {
        bestScore = score;
        localStorage.setItem(SCORE_BEST_KEY, String(Math.floor(bestScore)));
      }

      return events;
    },

    reset() {
      score = 0;
      displayScore = 0;
      comboMultiplier = 1;
      comboTimer = 0;
      wasGrounded = true;
      airTimeAccum = 0;
      turnAccum = 0;
      previousYaw = null;
    },
  };
}
