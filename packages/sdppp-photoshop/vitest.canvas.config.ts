import { defineConfig } from 'vitest/config';
export default defineConfig({
    esbuild: { jsx: 'automatic' },
    test: { include: [
        'src/providers/_canvas/**/*.test.{ts,tsx}',
        '../sdppp-photoshop-widgets/src/components/selectors/MultiImageSelector.test.tsx',
    ], testTimeout: 10000 },
});
