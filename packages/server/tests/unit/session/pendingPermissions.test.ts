import { createPendingPermissions } from '../../../src/session/pendingPermissions';

describe('pendingPermissions (first-approval-wins)', () => {
  it('first resolve wins, subsequent return false', () => {
    const p = createPendingPermissions();
    expect(p.tryResolve('r1')).toBe(true);
    expect(p.tryResolve('r1')).toBe(false);
  });
  it('isResolved reflects state', () => {
    const p = createPendingPermissions();
    expect(p.isResolved('r1')).toBe(false);
    p.tryResolve('r1');
    expect(p.isResolved('r1')).toBe(true);
  });
  it('clear removes the entry', () => {
    const p = createPendingPermissions();
    p.tryResolve('r1');
    p.clear('r1');
    expect(p.isResolved('r1')).toBe(false);
    expect(p.tryResolve('r1')).toBe(true);
  });
  it('size counts entries', () => {
    const p = createPendingPermissions();
    p.tryResolve('r1');
    p.tryResolve('r2');
    expect(p.size()).toBe(2);
  });
});
