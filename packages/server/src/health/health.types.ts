import type { ServerConfig } from '@blackbox/config';

export interface ReadinessProbe {
  check(): Promise<void>;
}

export interface ReadinessProbeOverrides {
  readonly postgres?: ReadinessProbe;
  readonly redis?: ReadinessProbe;
}

export interface HealthModuleOptions {
  readonly config: ServerConfig;
  readonly probes?: ReadinessProbeOverrides;
}
