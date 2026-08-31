import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExclusiveSyncGroup } from './ExclusiveSyncGroup';
import type { ButtonConfig } from './ExclusiveSyncGroup';

const buttons: ButtonConfig[] = [
  { id: 'a', text: 'A', supportsAutoSync: true },
  { id: 'b', text: 'B', supportsAutoSync: true },
];

const mockOnSync = vi.fn();
const mockOnAutoSyncChange = vi.fn();

describe('ExclusiveSyncGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('renders buttons', () => {
    render(
      <ExclusiveSyncGroup
        buttons={buttons}
        onSync={async (id) => mockOnSync(id)}
        onAutoSyncChange={(id, event) => mockOnAutoSyncChange(id, event)}
      />
    );
    expect(screen.getByTestId('sync-button-a')).toBeInTheDocument();
    expect(screen.getByTestId('sync-button-b')).toBeInTheDocument();
  });

  it('toggles auto-sync state exclusively', () => {
    render(
      <ExclusiveSyncGroup
        buttons={buttons}
        onSync={async (id) => mockOnSync(id)}
        onAutoSyncChange={(id, event) => mockOnAutoSyncChange(id, event)}
      />
    );
    const a = screen.getByTestId('sync-button-a');
    const b = screen.getByTestId('sync-button-b');

    fireEvent.click(a.querySelector('[data-testid="sync-button-auto-sync"]')!);
    fireEvent.click(b.querySelector('[data-testid="sync-button-auto-sync"]')!);
    expect(mockOnAutoSyncChange).toHaveBeenLastCalledWith('b', expect.any(Object));
  });
});
