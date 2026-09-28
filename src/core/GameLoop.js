import { GAME_CONFIG, resolvePerformanceProfile } from '../config/index.js';

/**
 * Fixed-step simulation loop with a separate render phase.
 */
export class GameLoop {
  constructor({
    fixedDeltaTime = 1 / (GAME_CONFIG.TICK_RATE || 60),
    maxFrameDelta = GAME_CONFIG.MAX_FRAME_DELTA,
    onFixedUpdate = () => {},
    onRender = () => {},
    targetRenderFps = null,
  } = {}) {
    this.fixedDeltaTime = fixedDeltaTime;
    this.maxFrameDelta = maxFrameDelta;
    this.onFixedUpdate = onFixedUpdate;
    this.onRender = onRender;
    const profileFps = resolvePerformanceProfile().renderFps;
    this.targetRenderFps = Math.max(1, Number(targetRenderFps) || profileFps || 60);
    this.renderInterval = 1000 / this.targetRenderFps;
    this.lastRenderTime = 0;

    this.running = false;
    this.animationFrameId = null;
    this.lastTime = 0;
    this.accumulator = 0;
    this.tick = 0;

    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.lastRenderTime = this.lastTime - this.renderInterval;
    this.animationFrameId = requestAnimationFrame(this._frame);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  _frame(now) {
    if (!this.running) return;

    const frameDelta = Math.min(
      Math.max(0, (now - this.lastTime) / 1000),
      this.maxFrameDelta
    );
    this.lastTime = now;
    this.accumulator += frameDelta;

    // Avoid an unbounded catch-up after a background-tab suspension.
    const maxSteps = GAME_CONFIG.MAX_CATCH_UP_STEPS;
    let steps = 0;
    while (this.accumulator >= this.fixedDeltaTime && steps < maxSteps) {
      this.tick++;
      this.onFixedUpdate(this.fixedDeltaTime, this.tick, now);
      this.accumulator -= this.fixedDeltaTime;
      steps++;
    }

    if (steps === maxSteps && this.accumulator >= this.fixedDeltaTime) {
      this.accumulator = 0;
    }

    if (now - this.lastRenderTime >= this.renderInterval) {
      this.lastRenderTime = now;
      this.onRender(Math.min(frameDelta, 0.05), now, this.accumulator / this.fixedDeltaTime);
    }
    this.animationFrameId = requestAnimationFrame(this._frame);
  }
}
