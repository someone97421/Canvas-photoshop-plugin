import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ImageSyncGroup } from './ImageSyncGroup';

describe('ImageSyncGroup', () => {
  it('renders image with provided URL', () => {
    render(
      <ImageSyncGroup
        imageUrl="https://via.placeholder.com/200"
        buttons={[]}
        onSync={async () => {}}
        onAutoSyncChange={() => {}}
      />
    );
    const image = document.querySelector('img[src="https://via.placeholder.com/200"]');
    expect(image).toBeInTheDocument();
  });
});

