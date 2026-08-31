# @sdppp/widgetable-ui

A standalone, provider-agnostic widget rendering system for dynamic UI forms.

## Features

- **Provider-agnostic**: Works with any backend provider (Photoshop, web, etc.)
- **Extensible widget system**: Register custom widgets for specific output types
- **Upload management**: Built-in upload pass system for handling file uploads
- **Type-safe**: Full TypeScript support with proper type definitions
- **React-based**: Built with React hooks and modern patterns

## Installation

```bash
pnpm add @sdppp/widgetable-ui
```

## Basic Usage

```tsx
import { WidgetableProvider, WidgetableRenderer } from '@sdppp/widgetable-ui';

function App() {
  const uploader = async (uploadInput, signal) => {
    // Your upload implementation
    return 'uploaded-file-url';
  };

  return (
    <WidgetableProvider uploader={uploader}>
      <WidgetableRenderer
        widgetableStructure={structure}
        widgetableValues={values}
        widgetableErrors={errors}
        onWidgetChange={handleChange}
        onTitleChange={handleTitleChange}
      />
    </WidgetableProvider>
  );
}
```

## Custom Widgets

Register custom widgets for specific output types:

```tsx
import { useWidgetable } from '@sdppp/widgetable-ui';

function MyComponent() {
  const { registerWidget } = useWidgetable();
  
  useEffect(() => {
    registerWidget('my-custom-type', ({ value, onValueChange }) => (
      <div>
        <input 
          value={value || ''} 
          onChange={(e) => onValueChange(e.target.value)} 
        />
      </div>
    ));
  }, [registerWidget]);
}
```

## API Reference

### Components
- `WidgetableProvider` - Context provider for widget system
- `WidgetableRenderer` - Main component for rendering widgets

### Hooks
- `useWidgetable()` - Access widget registry and upload system
- `useWidgetableRenderer()` - Low-level rendering hook

### Utilities
- `createDefaultWidgetRegistry()` - Create default widget set
- Various utility functions for UI weight calculation

## License

ISC