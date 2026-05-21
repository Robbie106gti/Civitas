/** Worker sim loop rate (see workerBridge SIM_HZ). */
export const SIM_TICK_HZ = 12;

/**
 * Heavy civic / social / housing systems run once per real-time minute at 12 Hz.
 * Aligns ~1 game-minute cadence when sim time tracks wall clock.
 */
export const SLOW_TICK_INTERVAL_TICKS = SIM_TICK_HZ * 60;
