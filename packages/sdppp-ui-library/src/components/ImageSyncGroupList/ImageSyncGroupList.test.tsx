import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ImageSyncGroupList } from './ImageSyncGroupList';
import type { ImageSyncGroupData } from './ImageSyncGroupList';

const groups: ImageSyncGroupData[] = [
  { imageUrl: 'https://via.placeholder.com/100', buttons: [] },
  { imageUrl: 'https://via.placeholder.com/200', buttons: [] },
];

describe('ImageSyncGroupList', () => {
  afterEach(cleanup);

  it('renders groups', () => {
    render(
      <ImageSyncGroupList
        groups={groups}
        onSync={async () => {}}
        onAutoSyncChange={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
      />
    );
    expect(screen.getByTestId('image-sync-group-0')).toBeInTheDocument();
    expect(screen.getByTestId('image-sync-group-1')).toBeInTheDocument();
  });

  it('calls onAdd and onRemove handlers', () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    render(
      <ImageSyncGroupList
        groups={groups}
        onSync={async () => {}}
        onAutoSyncChange={() => {}}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('does not show remove buttons when there is only one group', () => {
    const singleGroup: ImageSyncGroupData[] = [
      { imageUrl: 'https://via.placeholder.com/100', buttons: [] },
    ];

    render(
      <ImageSyncGroupList
        groups={singleGroup}
        onSync={async () => {}}
        onAutoSyncChange={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
      />
    );

    expect(screen.queryByLabelText('Remove group 0')).not.toBeInTheDocument();
  });
});
