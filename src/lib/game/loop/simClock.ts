import type { WorkerSimTickResultMessage } from '../protocol';

export class SimClock {
  previous: WorkerSimTickResultMessage | null = null;
  last: WorkerSimTickResultMessage | null = null;
  lastReceiveTime = 0;

  pushSnapshot(snapshot: WorkerSimTickResultMessage, receiveTime: number): void {
    this.previous = this.last;
    this.last = snapshot;
    this.lastReceiveTime = receiveTime;
  }

  /** 0..1 between previous and last sim snapshots for render interpolation. */
  interpolationAlpha(now: number, simHz = 12): number {
    if (!this.last) return 0;
    if (!this.previous) return 1;
    const periodMs = 1000 / simHz;
    const elapsed = now - this.lastReceiveTime;
    return Math.min(1, Math.max(0, elapsed / periodMs));
  }
}
