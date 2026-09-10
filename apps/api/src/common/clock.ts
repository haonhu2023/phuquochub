import { Injectable } from '@nestjs/common';

// Minimal injectable clock port — lets a service call `this.clock.now()` instead of `new Date()`
// directly, so its tests can supply a fixed Date without faking global timers. Used by
// EvidenceService.reviewEvidenceArtifact for the freshness-policy `now` input (see
// opening-hours-official-stable-v1.policy.ts — the pure evaluator itself never calls `new Date()`
// either; this is the one real caller that must supply it).
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
