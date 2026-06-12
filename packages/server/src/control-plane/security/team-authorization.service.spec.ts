import { TeamRole } from '@blackbox/database';
import { describe, expect, it } from 'vitest';
import { roleAllows } from './team-authorization.service';

describe('roleAllows', () => {
  it('enforces the ordered team permission hierarchy', () => {
    expect(roleAllows(TeamRole.owner, TeamRole.owner)).toBe(true);
    expect(roleAllows(TeamRole.owner, TeamRole.admin)).toBe(true);
    expect(roleAllows(TeamRole.admin, TeamRole.member)).toBe(true);
    expect(roleAllows(TeamRole.member, TeamRole.viewer)).toBe(true);
    expect(roleAllows(TeamRole.viewer, TeamRole.member)).toBe(false);
    expect(roleAllows(TeamRole.member, TeamRole.admin)).toBe(false);
    expect(roleAllows(TeamRole.admin, TeamRole.owner)).toBe(false);
  });
});
