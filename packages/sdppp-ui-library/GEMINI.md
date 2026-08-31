# Gemini Project Overview: react-antd-tailwind-vitest-demo

## Project Overview

This is a React and TypeScript project, bootstrapped with Vite. It is configured with Ant Design for the UI component library, Tailwind CSS for utility-first styling, and Vitest for unit and component testing. The project is set up for component-driven development using Storybook.

- **Framework:** React 19
- **Language:** TypeScript
- **Build Tool:** Vite
- **UI Library:** Ant Design
- **Styling:** Tailwind CSS
- **Testing:** Vitest, with React Testing Library
- **Component Development:** Storybook

## Building and Running

This project uses `pnpm` as the package manager.

### Development

To start the Storybook development server:

```bash
pnpm dev
```

This will open Storybook in your browser, typically at `http://localhost:6006`.

### Building

To create a production build of the application:

```bash
pnpm build
```

This command bundles the application for deployment.

### Testing

To run the test suite once:

```bash
pnpm test:run
```

To run the tests in watch mode:

```bash
pnpm test
```

## Development Conventions

### Component-Driven Development

The project is structured as a workspace with a publishable UI package and a separate Storybook playground for developing components in isolation.

- **Stories:** Component stories are located in `playground/src/stories`.
- **Components:** Reusable components are located in `src/components`.

### Testing

- **Unit and Component Tests:** Tests are written with Vitest and React Testing Library. Test files are co-located with their corresponding components in `src`.
- **Setup:** Test setup and configuration can be found in `vitest.config.ts` and `src/test/setup.ts`.

### Linting

The project uses ESLint for code quality and consistency. To run the linter:

```bash
pnpm lint
```

### Code Style

- **Explicit Type Imports**: All import statements must explicitly use `import type` when importing types and interfaces. For example: `import type { MyType } from './types';`
