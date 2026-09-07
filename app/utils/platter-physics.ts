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
 * Our model uses 180 mirrors for the large, nominal-speed row. This gives a
 * synthetic flash cadence of 100 Hz at 33 1/3 RPM and 135 Hz at 45 RPM.
 * These are simulation parameters, not verified SL-1200 hardware dimensions.
 */
export const STROBE_REFERENCE_DOT_COUNT = 180

/**
 * Chosen mirror counts, outside edge towards the record. Their derived lock
 * pitches approximate the deck's -3.3%, 0%, +3.3%, +6.4% legend.
 */
export const STROBE_DOT_COUNTS = [186, 180, 174, 169] as const

/** Presentation threshold in deg/ms above which the rim is fully blurred. */
const FULL_MOTION_BLUR_VELOCITY = 0.045

/** JavaScript's remainder can be negative; angles need a positive wrap. */
function wrapAngle(angle: number): number {
	return ((angle % 360) + 360) % 360
}

/** Treat the conventional "33" control label as the actual 33 1/3 RPM. */
export function resolveTurntableRpm(rpm: number): number {
	return rpm === 33 ? 100 / 3 : rpm
}

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
	const baseVelocity = (resolveTurntableRpm(rpm) * 360) / 60000

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
	return wrapAngle(currentAngle + velocity * deltaTime)
}

/**
 * Return the model's flash rate in Hz for the selected nominal platter speed.
 * It follows 33/45 selection, not pitch or actual velocity: changing the pitch
 * must make the reference row drift. No screen flashing is needed to draw it.
 */
export function calculateStrobeFlashFrequency(rpm: number): number {
	return (STROBE_REFERENCE_DOT_COUNT * resolveTurntableRpm(rpm)) / 60
}

/**
 * Pitch at which a row appears stationary under the reference strobe.
 */
export function calculateStrobeLockPitch(dotCount: number): number {
	return (STROBE_REFERENCE_DOT_COUNT / dotCount - 1) * 100
}

/**
 * Convert physical platter velocity to the slow apparent motion seen under a
 * strobe. Subtracting the nearest whole mirror-step per flash reproduces the
 * wagon-wheel alias while remaining independent of display refresh rate.
 * @param physicalVelocity - Actual angular velocity in degrees per millisecond
 * @param rpm - Selected nominal speed (33 or 45), not pitch-adjusted speed
 * @param dotCount - Number of equally spaced mirrors in this row
 * @returns Apparent angular velocity in degrees per millisecond
 */
export function calculateStrobeApparentVelocity(
	physicalVelocity: number,
	rpm: number,
	dotCount: number
): number {
	if (physicalVelocity === 0 || dotCount <= 0) return 0

	const flashFrequency = calculateStrobeFlashFrequency(rpm)
	const mirrorSpacing = 360 / dotCount
	const oneMirrorStepVelocity = (mirrorSpacing * flashFrequency) / 1000
	const wholeStepsPerFlash = Math.round(
		physicalVelocity / oneMirrorStepVelocity
	)

	return physicalVelocity - wholeStepsPerFlash * oneMirrorStepVelocity
}

/** Blend away the motion blur as individual physical mirrors become visible. */
export function calculatePlatterMotionMix(velocity: number): number {
	return Math.min(1, Math.abs(velocity) / FULL_MOTION_BLUR_VELOCITY)
}

/**
 * At low speed, bring the illuminated mirrors back onto the physical platter.
 * Rows repeat every mirror spacing, so use the shortest equivalent phase rather
 * than sweeping through an arbitrary accumulated strobe rotation on stopping.
 */
export function calculateStrobeRenderAngle(
	physicalAngle: number,
	simulatedAngle: number,
	velocity: number,
	dotCount: number
): number {
	const mix = calculatePlatterMotionMix(velocity)
	if (mix === 0 || dotCount <= 0) return physicalAngle
	if (mix === 1) return simulatedAngle
	const period = 360 / dotCount
	const phaseDifference =
		((((simulatedAngle - physicalAngle + period / 2) % period) + period) %
			period) -
		period / 2
	// Smoothstep keeps the blend gentle at both ends of the low-speed interval.
	const easedMix = mix * mix * (3 - 2 * mix)
	return wrapAngle(physicalAngle + phaseDifference * easedMix)
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
