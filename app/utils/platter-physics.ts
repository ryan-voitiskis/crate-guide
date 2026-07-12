/**
 * Pure functions for turntable platter physics calculations.
 * Extracted from Platter.vue for testability.
 */

/**
 * Exponential smoothing factor for ~2s to reach 95% of target velocity.
 * Formula derivation: factor = 3 / time_in_ms (where time is to reach 95%)
 */
export const VELOCITY_FACTOR = 0.0015

/**
 * Minimum velocity threshold below which animation stops.
 * Prevents infinite animation loops with negligible movement.
 */
export const VELOCITY_THRESHOLD = 0.0001

/**
 * Maximum delta time in ms to prevent large jumps after tab is backgrounded.
 */
export const MAX_DELTA_TIME = 100

/**
 * Default delta time for first frame when no previous timestamp exists.
 */
export const DEFAULT_DELTA_TIME = 16

/**
 * Calculate target angular velocity based on RPM and pitch settings.
 * @param rpm - Turntable RPM (typically 33 or 45)
 * @param pitch - Pitch adjustment as percentage (-100 to 100)
 * @param pitchRange - Maximum pitch range as percentage (e.g., 8, 16, 50)
 * @param isPlaying - Whether the deck is currently playing
 * @returns Target velocity in degrees per millisecond
 */
export function calculateTargetVelocity(
	rpm: number,
	pitch: number,
	pitchRange: number,
	isPlaying: boolean
): number {
	if (!isPlaying) return 0

	// RPM to deg/ms: RPM * 360° / 60000ms
	const baseVelocity = (rpm * 360) / 60000

	// Pitch factor: at 100% pitch with 8% range, factor = 1.08
	const pitchFactor = 1 + (pitch / 100) * (pitchRange / 100)

	return baseVelocity * pitchFactor
}

/**
 * Calculate delta time between frames, capped to prevent large jumps.
 * @param currentTime - Current frame timestamp from requestAnimationFrame
 * @param lastTime - Previous frame timestamp (0 for first frame)
 * @returns Delta time in milliseconds, capped at MAX_DELTA_TIME
 */
export function calculateDeltaTime(
	currentTime: number,
	lastTime: number
): number {
	const rawDelta = lastTime ? currentTime - lastTime : DEFAULT_DELTA_TIME
	return Math.min(rawDelta, MAX_DELTA_TIME)
}

/**
 * Apply exponential smoothing to approach target velocity.
 * Creates natural acceleration/deceleration feel.
 * @param currentVelocity - Current velocity in deg/ms
 * @param targetVelocity - Target velocity in deg/ms
 * @param deltaTime - Time since last frame in ms
 * @returns New velocity after smoothing
 */
export function smoothVelocity(
	currentVelocity: number,
	targetVelocity: number,
	deltaTime: number
): number {
	return (
		currentVelocity +
		(targetVelocity - currentVelocity) * VELOCITY_FACTOR * deltaTime
	)
}

/**
 * Determine if animation should continue running.
 * Continues while accelerating toward target OR decelerating above threshold.
 * @param targetVelocity - Target velocity in deg/ms
 * @param currentVelocity - Current velocity in deg/ms
 * @returns True if animation should continue
 */
export function shouldContinueAnimation(
	targetVelocity: number,
	currentVelocity: number
): boolean {
	return targetVelocity > 0 || currentVelocity > VELOCITY_THRESHOLD
}

/**
 * Calculate new angle after rotation, wrapped to 0-360 range.
 * @param currentAngle - Current angle in degrees
 * @param velocity - Current velocity in deg/ms
 * @param deltaTime - Time since last frame in ms
 * @returns New angle in degrees (0-360)
 */
export function calculateNextAngle(
	currentAngle: number,
	velocity: number,
	deltaTime: number
): number {
	return (currentAngle + velocity * deltaTime) % 360
}

/**
 * Simulate animation over a duration to calculate final state.
 * Useful for testing convergence behavior.
 * @param targetVelocity - Target velocity in deg/ms
 * @param durationMs - Duration to simulate in ms
 * @param frameTime - Time per frame in ms (default 16 for ~60fps)
 * @returns Final velocity after simulation
 */
export function simulateVelocityConvergence(
	targetVelocity: number,
	durationMs: number,
	frameTime: number = DEFAULT_DELTA_TIME
): number {
	let velocity = 0
	const frames = Math.floor(durationMs / frameTime)

	for (let i = 0; i < frames; i++) {
		velocity = smoothVelocity(velocity, targetVelocity, frameTime)
	}

	return velocity
}
