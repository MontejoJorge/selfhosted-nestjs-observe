/**
 * Self-generated traffic: on startup the app calls its own endpoints so the
 * dashboard has plenty of telemetry. Tune it here.
 */
export const LOAD_CONFIG = {
  /** Turn the generator off entirely. */
  enabled: true,
  /** Stop after this many minutes; 0 runs until the app stops. */
  durationMinutes: 0,
  /** Average requests per second outside bursts. */
  baseRps: 3,
  /**
   * The base rate drifts along a wave so the charts have slow ups and downs:
   * it swings by ±`amplitude` (a share of `baseRps`) every `periodMinutes`.
   */
  wave: { periodMinutes: 6, amplitude: 0.7 },
  /** Random spikes: their spacing, length and rate are picked from these [min, max] ranges. */
  burst: {
    everySeconds: [45, 150],
    lastsSeconds: [5, 25],
    rps: [15, 40],
  },
  /** Share of requests that are meant to fail (404, 400 or 500). */
  errorRate: 0.12,
  /** Requests waiting for a response at once; extra ones are skipped. */
  maxInFlight: 60,
  /** How often the generator logs its counters. */
  reportEverySeconds: 30,
} as const;
