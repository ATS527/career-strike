import { COUNTRY_CODES, COUNTRY_REGISTRY, type CountryCode, type MarketStatus } from './countries.js';
import { EMPLOYER_TARGETS, employerTargetRecord, type EmployerTargetRegistryRecord } from './employers.js';
import type { Db } from '../store/db.js';

/**
 * Per-installation market readiness. The registry status stays CONFIGURED until a curated target
 * has an adopted board whose health record shows a successful retrieval; only then may this
 * installation describe the market as DISCOVERY_AVAILABLE. Signals are read from local
 * source-board health records, never from the documentation review that curated the targets.
 */
export interface MarketReadiness {
  code: CountryCode;
  name: string;
  /** Registry status; deliberately separate from local evidence. */
  configuredStatus: MarketStatus;
  /** True only when at least one curated target is adopted and healthy in this installation. */
  discoveryAvailable: boolean;
  targets: EmployerTargetRegistryRecord[];
}

export function marketReadiness(db: Db): MarketReadiness[] {
  return COUNTRY_CODES.map((code) => {
    const country = COUNTRY_REGISTRY[code]!;
    const targets = EMPLOYER_TARGETS.filter((target) => target.countries.includes(code)).map((target) => employerTargetRecord(db, target));
    const discoveryAvailable = targets.some((target) => target.monitoringState === 'HEALTHY');
    return { code, name: country.name, configuredStatus: country.status, discoveryAvailable, targets };
  });
}
