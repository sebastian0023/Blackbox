export type DependencyReadinessStatus = 'ready' | 'unavailable';

export interface DependencyReadiness {
  readonly status: DependencyReadinessStatus;
}

export interface LivenessResponse {
  readonly status: 'ok';
}

export interface ReadinessResponse {
  readonly dependencies: {
    readonly postgres: DependencyReadiness;
    readonly redis: DependencyReadiness;
  };
  readonly status: 'ready' | 'degraded';
}
