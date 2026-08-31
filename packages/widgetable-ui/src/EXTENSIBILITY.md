# Widgetable System Extensibility Guide

The widgetable system has been refactored to support extensible widget components. This allows external developers to provide custom implementations for any widget type, including images and masks widgets.

## Overview

The new system replaces the hardcoded `switch` statement in `useWidgetableRenderer` with a registry-based approach that allows dynamic widget registration and customization.

## Key Components

### 1. Widget Registry (`widget-registry.tsx`)

Defines the core types and interfaces:
- `WidgetRenderer`: Function type for rendering widgets
- `WidgetRegistry`: Mapping of widget types to renderers
- `WidgetRegistryContextType`: Context interface for registry operations

### 2. Enhanced WidgetableProvider (`context.tsx`)

Now supports:
- `widgetRegistry` prop for initial custom widgets
- `registerWidget()` method for runtime registration
- `unregisterWidget()` method for removing widgets
- `getWidgetRenderer()` method for retrieving renderers

### 3. Refactored useWidgetableRenderer (`main.tsx`)

- Uses registry lookup instead of switch statement
- Maintains backward compatibility
- Supports dynamic widget resolution

## Usage Examples

### Basic Custom Widget Registration

```tsx
import { WidgetableProvider, WidgetRenderer } from '../extensible';

const MyCustomImageWidget: WidgetRenderer = ({ value, onValueChange, extraOptions }) => {
    return (
        <div style={{ border: '2px dashed #4CAF50', padding: '16px' }}>
            <h4>Custom Image Widget</h4>
            {/* Your custom implementation */}
        </div>
    );
};

const customRegistry = {
    'images': MyCustomImageWidget,
};

<WidgetableProvider uploader={myUploader} widgetRegistry={customRegistry}>
    {/* Your app */}
</WidgetableProvider>
```

### Runtime Widget Registration

```tsx
import { useWidgetable } from '../extensible';

const MyComponent = () => {
    const { registerWidget, unregisterWidget } = useWidgetable();
    
    const enableCustomWidget = () => {
        registerWidget('images', MyCustomImageWidget);
    };
    
    const disableCustomWidget = () => {
        unregisterWidget('images');
    };
    
    return (
        <div>
            <button onClick={enableCustomWidget}>Enable Custom Images</button>
            <button onClick={disableCustomWidget}>Use Default Images</button>
        </div>
    );
};
```

## Widget Renderer Interface

All custom widgets must implement the `WidgetRenderer` interface:

```tsx
interface WidgetRendererProps {
    fieldInfo: WidgetableNode;      // Field metadata
    widget: WidgetableWidget;       // Widget configuration
    widgetIndex: number;            // Widget index in field
    value: any;                     // Current widget value
    onValueChange: (value: any) => void;  // Value change handler
    extraOptions?: any;             // Additional options
}

type WidgetRenderer = (props: WidgetRendererProps) => React.ReactElement | null;
```

## Supported Widget Types

The following widget types can be customized:
- `'images'` - Image selection widgets
- `'masks'` - Mask selection widgets
- `'number'` - Number input widgets
- `'combo'` - Dropdown/combo widgets
- `'segment'` - Segment selection widgets
- `'boolean'`/`'toggle'` - Toggle/boolean widgets
- `'string'`/`'text'`/`'customtext'` - Text input widgets

## Migration Guide

### Before (Hardcoded)
```tsx
// Old switch-based approach in useWidgetableRenderer
switch (widgetType) {
    case 'images':
        return renderImageWidget(fieldInfo, widget, widgetIndex);
    // ...
}
```

### After (Extensible)
```tsx
// New registry-based approach
const renderer = getWidgetRenderer(widgetType);
return renderer ? renderer({
    fieldInfo,
    widget,
    widgetIndex,
    value,
    onValueChange,
    extraOptions
}) : null;
```

## Examples

See the `examples/` directory for comprehensive usage examples:
- `custom-widgets.tsx` - Custom widget implementations
- `usage-examples.tsx` - Various usage patterns and scenarios

## Benefits

1. **Extensibility**: External modules can provide custom widget implementations
2. **Flexibility**: Runtime widget registration and deregistration
3. **Maintainability**: Clean separation of widget logic
4. **Backward Compatibility**: Existing code continues to work unchanged
5. **Type Safety**: Full TypeScript support with proper interfaces

## API Reference

### WidgetableProvider Props
```tsx
interface WidgetableProviderProps {
    children: ReactNode;
    uploader: (uploadInput: UploadPassInput, signal?: AbortSignal) => Promise<string>;
    widgetRegistry?: WidgetRegistry;  // NEW: Custom widget registry
}
```

### useWidgetable Hook
```tsx
interface WidgetableContextType {
    // Existing upload methods...
    
    // NEW: Registry methods
    registry: WidgetRegistry;
    registerWidget: (widgetType: string, renderer: WidgetRenderer) => void;
    unregisterWidget: (widgetType: string) => void;
    getWidgetRenderer: (widgetType: string) => WidgetRenderer | null;
}
```

This extensible system enables powerful customization while maintaining full backward compatibility with existing code.