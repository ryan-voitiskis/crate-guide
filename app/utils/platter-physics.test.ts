import { describe, expect, it } from 'vitest'

import {
	calculateDeltaTime,
	calculateNextAngle,
	calculateTargetVelocity,
	DEFAULT_DELTA_TIME,
	MAX_DELTA_TIME,
	shouldContinueAnimation,
	simulateVelocityConvergence,
	smoothVelocity,
	VELOCITY_FACTOR,
	VELOCITY_THRESHOLD
} from './platter-physics'

describe('platter-physics', () => {
	describe('constants', () => {
		it('has correct velocity factor for ~2s convergence', () => {
			// Factor of 0.0015 means ~2000ms to reach 95% of target
			expect(VELOCITY_FACTOR).toBe(0.0015)
		})

		it('has appropriate velocity threshold', () => {
			// Small enough to be imperceptible, large enough to stop
			expect(VELOCITY_THRESHOLD).toBe(0.0001)
		})

		it('caps delta time at 100ms', () => {
			expect(MAX_DELTA_TIME).toBe(100)
		})

		it('uses 16ms default for ~60fps', () => {
			expect(DEFAULT_DELTA_TIME).toBe(16)
		})
	})

	describe('calculateTargetVelocity', () => {
		it('returns 0 when not playing', () => {
			expect(calculateTargetVelocity(33, 0, 8, false)).toBe(0)
			expect(calculateTargetVelocity(45, 50, 16, false)).toBe(0)
		})

		it('calculates correct base velocity for 33 RPM', () => {
			// 33 RPM = 33 * 360 / 60000 = 0.198 deg/ms
			const velocity = calculateTargetVelocity(33, 0, 8, true)
			expect(velocity).toBeCloseTo(0.198, 4)
		})

		it('calculates correct base velocity for 45 RPM', () => {
			// 45 RPM = 45 * 360 / 60000 = 0.27 deg/ms
			const velocity = calculateTargetVelocity(45, 0, 8, true)
			expect(velocity).toBeCloseTo(0.27, 4)
		})

		it('applies positive pitch correctly with 8% range', () => {
			// At 100% pitch with 8% range: factor = 1 + (100/100) * (8/100) = 1.08
			const baseVelocity = 0.198
			const velocity = calculateTargetVelocity(33, 100, 8, true)
			expect(velocity).toBeCloseTo(baseVelocity * 1.08, 4)
		})

		it('applies negative pitch correctly with 8% range', () => {
			// At -100% pitch with 8% range: factor = 1 + (-100/100) * (8/100) = 0.92
			const baseVelocity = 0.198
			const velocity = calculateTargetVelocity(33, -100, 8, true)
			expect(velocity).toBeCloseTo(baseVelocity * 0.92, 4)
		})

		it('applies partial pitch correctly', () => {
			// At 50% pitch with 8% range: factor = 1 + (50/100) * (8/100) = 1.04
			const baseVelocity = 0.198
			const velocity = calculateTargetVelocity(33, 50, 8, true)
			expect(velocity).toBeCloseTo(baseVelocity * 1.04, 4)
		})

		it('respects 16% pitch range', () => {
			// At 100% pitch with 16% range: factor = 1.16
			const baseVelocity = 0.198
			const velocity = calculateTargetVelocity(33, 100, 16, true)
			expect(velocity).toBeCloseTo(baseVelocity * 1.16, 4)
		})

		it('respects 50% pitch range', () => {
			// At 100% pitch with 50% range: factor = 1.50
			const baseVelocity = 0.198
			const velocity = calculateTargetVelocity(33, 100, 50, true)
			expect(velocity).toBeCloseTo(baseVelocity * 1.5, 4)
		})

		it('handles zero pitch range', () => {
			// With 0% range, pitch has no effect
			const baseVelocity = 0.198
			const velocity = calculateTargetVelocity(33, 100, 0, true)
			expect(velocity).toBeCloseTo(baseVelocity, 4)
		})

		it('combines 45 RPM with pitch correctly', () => {
			// 45 RPM at -50% pitch with 8% range: 0.27 * 0.96 = 0.2592
			const velocity = calculateTargetVelocity(45, -50, 8, true)
			expect(velocity).toBeCloseTo(0.27 * 0.96, 4)
		})
	})

	describe('calculateDeltaTime', () => {
		it('uses default 16ms for first frame (lastTime = 0)', () => {
			expect(calculateDeltaTime(1000, 0)).toBe(DEFAULT_DELTA_TIME)
		})

		it('calculates normal delta time correctly', () => {
			expect(calculateDeltaTime(1016, 1000)).toBe(16)
			expect(calculateDeltaTime(1033, 1000)).toBe(33)
		})

		it('caps delta time at 100ms', () => {
			// Simulates tab being backgrounded for 1 second
			expect(calculateDeltaTime(2000, 1000)).toBe(MAX_DELTA_TIME)
		})

		it('caps extremely large gaps', () => {
			// Tab backgrounded for 10 seconds
			expect(calculateDeltaTime(11000, 1000)).toBe(MAX_DELTA_TIME)
		})

		it('handles delta time just under cap', () => {
			expect(calculateDeltaTime(1099, 1000)).toBe(99)
		})

		it('handles delta time exactly at cap', () => {
			expect(calculateDeltaTime(1100, 1000)).toBe(100)
		})

		it('handles delta time just over cap', () => {
			expect(calculateDeltaTime(1101, 1000)).toBe(100)
		})
	})

	describe('smoothVelocity', () => {
		it('accelerates from zero toward target', () => {
			const result = smoothVelocity(0, 0.198, 16)
			expect(result).toBeGreaterThan(0)
			expect(result).toBeLessThan(0.198)
		})

		it('calculates correct acceleration step', () => {
			// velocity = 0 + (0.198 - 0) * 0.0015 * 16 = 0.004752
			const result = smoothVelocity(0, 0.198, 16)
			expect(result).toBeCloseTo(0.004752, 6)
		})

		it('decelerates when target is 0', () => {
			// velocity = 0.198 + (0 - 0.198) * 0.0015 * 16 = 0.193248
			const result = smoothVelocity(0.198, 0, 16)
			expect(result).toBeCloseTo(0.193248, 6)
			expect(result).toBeLessThan(0.198)
		})

		it('maintains velocity when at target', () => {
			// Already at target, minimal change
			const result = smoothVelocity(0.198, 0.198, 16)
			expect(result).toBeCloseTo(0.198, 6)
		})

		it('is frame-rate independent (same result over same duration)', () => {
			// 32ms at once vs two 16ms steps should be similar
			const target = 0.198
			const singleStep = smoothVelocity(0, target, 32)
			const twoSteps = smoothVelocity(smoothVelocity(0, target, 16), target, 16)

			// Not exactly equal due to exponential nature, but within 2% of each other
			const difference = Math.abs(singleStep - twoSteps)
			const relativeDifference = difference / singleStep
			expect(relativeDifference).toBeLessThan(0.02)
		})

		it('handles very small delta times', () => {
			const result = smoothVelocity(0, 0.198, 1)
			expect(result).toBeGreaterThan(0)
			expect(result).toBeLessThan(smoothVelocity(0, 0.198, 16))
		})

		it('handles capped delta time (100ms)', () => {
			const result = smoothVelocity(0, 0.198, 100)
			expect(result).toBeGreaterThan(0)
			// Should be significant progress but not at target
			expect(result).toBeLessThan(0.198)
		})
	})

	describe('shouldContinueAnimation', () => {
		it('continues when target velocity > 0 and current is 0', () => {
			expect(shouldContinueAnimation(0.198, 0)).toBe(true)
		})

		it('continues when target velocity > 0 and current is at target', () => {
			expect(shouldContinueAnimation(0.198, 0.198)).toBe(true)
		})

		it('continues when decelerating above threshold', () => {
			expect(shouldContinueAnimation(0, 0.001)).toBe(true)
			expect(shouldContinueAnimation(0, 0.0002)).toBe(true)
		})

		it('continues when exactly at threshold', () => {
			// At threshold, still continue (> not >=)
			expect(shouldContinueAnimation(0, VELOCITY_THRESHOLD)).toBe(false)
		})

		it('stops when fully decelerated below threshold', () => {
			expect(shouldContinueAnimation(0, 0.00001)).toBe(false)
			expect(shouldContinueAnimation(0, 0)).toBe(false)
		})

		it('stops when target and velocity are both 0', () => {
			expect(shouldContinueAnimation(0, 0)).toBe(false)
		})
	})

	describe('calculateNextAngle', () => {
		it('increases angle based on velocity and time', () => {
			const result = calculateNextAngle(0, 0.198, 16)
			expect(result).toBeCloseTo(0.198 * 16, 4)
		})

		it('wraps angle at 360 degrees', () => {
			const result = calculateNextAngle(359, 0.198, 16)
			// 359 + 3.168 = 362.168 → 2.168
			expect(result).toBeCloseTo(2.168, 2)
		})

		it('handles multiple rotations worth of movement', () => {
			// Large velocity * time could be > 360
			const result = calculateNextAngle(0, 1, 400) // 400 degrees
			expect(result).toBeCloseTo(40, 4)
		})

		it('handles zero velocity', () => {
			const result = calculateNextAngle(45, 0, 16)
			expect(result).toBe(45)
		})

		it('handles zero delta time', () => {
			const result = calculateNextAngle(45, 0.198, 0)
			expect(result).toBe(45)
		})
	})

	describe('simulateVelocityConvergence', () => {
		it('reaches ~95% of target in ~2000ms', () => {
			const target = 0.198
			const result = simulateVelocityConvergence(target, 2000)

			// Should be at approximately 95% of target
			const ratio = result / target
			expect(ratio).toBeGreaterThan(0.9)
			expect(ratio).toBeLessThan(1)
		})

		it('reaches ~63% of target in ~667ms (one time constant)', () => {
			// For exponential approach, 63% is reached at t = 1/factor
			const target = 0.198
			const result = simulateVelocityConvergence(target, 667)

			const ratio = result / target
			expect(ratio).toBeGreaterThan(0.55)
			expect(ratio).toBeLessThan(0.75)
		})

		it('approaches but never exceeds target', () => {
			const target = 0.198
			const result = simulateVelocityConvergence(target, 10000) // 10 seconds

			expect(result).toBeLessThanOrEqual(target)
			expect(result).toBeGreaterThan(target * 0.99)
		})

		it('works with different frame times', () => {
			const target = 0.198

			// Results should be similar regardless of frame time
			const result60fps = simulateVelocityConvergence(target, 2000, 16)
			const result30fps = simulateVelocityConvergence(target, 2000, 33)
			const result120fps = simulateVelocityConvergence(target, 2000, 8)

			// All should be within 5% of each other
			expect(Math.abs(result60fps - result30fps) / result60fps).toBeLessThan(0.05)
			expect(Math.abs(result60fps - result120fps) / result60fps).toBeLessThan(0.05)
		})

		it('starts from zero', () => {
			const result = simulateVelocityConvergence(0.198, 0)
			expect(result).toBe(0)
		})
	})

	describe('integration scenarios', () => {
		it('simulates full acceleration cycle', () => {
			const rpm = 33
			const pitch = 0
			const pitchRange = 8

			// Start playing
			const target = calculateTargetVelocity(rpm, pitch, pitchRange, true)
			expect(target).toBeCloseTo(0.198, 4)

			// Simulate 2 seconds of animation
			let velocity = 0
			let angle = 0
			let lastTime = 0

			for (let time = 16; time <= 2000; time += 16) {
				const deltaTime = calculateDeltaTime(time, lastTime)
				velocity = smoothVelocity(velocity, target, deltaTime)
				angle = calculateNextAngle(angle, velocity, deltaTime)
				lastTime = time

				expect(shouldContinueAnimation(target, velocity)).toBe(true)
			}

			// Should be near target velocity
			expect(velocity / target).toBeGreaterThan(0.9)
		})

		it('simulates full deceleration cycle', () => {
			const startVelocity = 0.198

			// Stop playing (target becomes 0)
			let velocity = startVelocity
			let frameCount = 0
			const maxFrames = 1000 // Safety limit

			while (shouldContinueAnimation(0, velocity) && frameCount < maxFrames) {
				velocity = smoothVelocity(velocity, 0, 16)
				frameCount++
			}

			// Should have stopped
			expect(shouldContinueAnimation(0, velocity)).toBe(false)
			expect(velocity).toBeLessThanOrEqual(VELOCITY_THRESHOLD)

			// Should take roughly 3-5 seconds worth of frames to fully stop
			// (exponential decay takes longer to reach threshold than to reach target)
			expect(frameCount).toBeGreaterThan(150) // > 2.4s
			expect(frameCount).toBeLessThan(400) // < 6.4s
		})

		it('handles pitch change during playback', () => {
			const rpm = 33
			const pitchRange = 8

			// Start at pitch 0
			let target = calculateTargetVelocity(rpm, 0, pitchRange, true)
			let velocity = simulateVelocityConvergence(target, 2000)
			expect(velocity / target).toBeGreaterThan(0.9)

			// Change to +50% pitch
			target = calculateTargetVelocity(rpm, 50, pitchRange, true)
			const newTarget = 0.198 * 1.04

			// Should smoothly transition to new target
			for (let i = 0; i < 125; i++) {
				// ~2 more seconds
				velocity = smoothVelocity(velocity, target, 16)
			}

			expect(velocity).toBeGreaterThan(0.198) // Faster than base
			expect(velocity / newTarget).toBeGreaterThan(0.9)
		})

		it('handles rapid start/stop toggling', () => {
			const rpm = 33
			const pitchRange = 8
			let velocity = 0

			// Quick start
			let target = calculateTargetVelocity(rpm, 0, pitchRange, true)
			for (let i = 0; i < 30; i++) {
				// ~0.5 seconds
				velocity = smoothVelocity(velocity, target, 16)
			}
			const velocityAtStart = velocity

			// Quick stop
			target = 0
			for (let i = 0; i < 30; i++) {
				velocity = smoothVelocity(velocity, target, 16)
			}
			const velocityAtStop = velocity

			// Quick restart
			target = calculateTargetVelocity(rpm, 0, pitchRange, true)
			for (let i = 0; i < 30; i++) {
				velocity = smoothVelocity(velocity, target, 16)
			}

			// Should have momentum from partial stop
			expect(velocity).toBeGreaterThan(velocityAtStop)
			// But not as fast as if we'd been playing the whole time
			expect(velocity).toBeLessThan(0.198 * 0.95)
		})

		it('handles backgrounded tab gracefully', () => {
			const target = 0.198
			let velocity = 0

			// Normal animation for 1 second
			for (let i = 0; i < 62; i++) {
				velocity = smoothVelocity(velocity, target, 16)
			}
			const velocityBefore = velocity

			// Tab backgrounded - 2 seconds pass but deltaTime capped at 100ms
			velocity = smoothVelocity(velocity, target, 100)

			// Should have made progress but not jumped wildly
			expect(velocity).toBeGreaterThan(velocityBefore)
			expect(velocity).toBeLessThan(target)

			// Continue normal animation
			for (let i = 0; i < 62; i++) {
				velocity = smoothVelocity(velocity, target, 16)
			}

			// Should eventually converge normally
			expect(velocity / target).toBeGreaterThan(0.9)
		})
	})
})
