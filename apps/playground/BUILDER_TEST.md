# 🏗️ Visual Builder Test Guide

## Accessing the Builder

1. Start the playground dev server:
   ```bash
   cd apps/playground
   pnpm dev
   ```

2. Navigate to: **http://localhost:3000/builder-test**

## Features to Test

### 🎨 Component Palette (Left Sidebar)

The component palette displays all available form components organized by category:

**Basic Inputs:**
- 📝 Text Input - Single line text field
- 📧 Email Input - Email with validation
- 🔢 Number Input - Numeric field with min/max
- 📄 Text Area - Multi-line text input

**Selection:**
- 📋 Select Dropdown - Dropdown selection
- ☑️ Checkbox - Single checkbox input

**Features:**
- ✅ Search components by name, description, or tags
- ✅ Components grouped by category
- ✅ Icon and description for each component

### 🖼️ Form Canvas (Center)

The main workspace where you build your form:

**Actions:**
- ➕ Click a component in the palette to add it to the form
- 🎯 Click a field to select it (highlights in blue)
- 🗑️ Click the × button to remove a field
- 👆 Click outside to deselect

**Visual Feedback:**
- Selected fields have a blue border and background
- Selected indicator shows which field is active
- Empty state guides you to start building

### ⚙️ Property Panel (Right Sidebar)

Edit properties of the selected field:

**Available Properties:**
- **Label** - Field display name (text input)
- **Placeholder** - Hint text (text input)
- **Help Text** - Additional guidance (textarea)
- **Required** - Make field mandatory (checkbox)
- **Min/Max** - Number field constraints (number inputs)
- **Rows** - Textarea height (number input)

**Features:**
- Real-time updates as you type
- Different editor types (text, number, boolean, select, textarea)
- Shows "No field selected" when nothing is selected

### 🛠️ Toolbar (Top)

**Available Actions:**
- ↶ **Undo** - Revert last change (Ctrl/Cmd + Z)
- ↷ **Redo** - Redo undone change (Ctrl/Cmd + Shift + Z)
- 💾 **Save** - Export form configuration as JSON
- 📤 **Export** - Download form as TypeScript/JSON

**Status Indicators:**
- Shows current field count
- Undo/Redo buttons disabled when not available

## Test Scenarios

### Scenario 1: Basic Form Creation

1. Add a "Text Input" field
2. Select it and change label to "Full Name"
3. Add placeholder "John Doe"
4. Mark as required
5. Add an "Email Input" field below
6. Click Save to see the JSON output

### Scenario 2: Complex Form

1. Add multiple field types:
   - Text Input (Name)
   - Email Input (Email)
   - Number Input (Age)
   - Select Dropdown (Country)
   - Textarea (Message)
   - Checkbox (Terms)

2. Configure each field with appropriate properties
3. Test undo/redo functionality
4. Export as JSON

### Scenario 3: Property Editing

1. Add a Number Input field
2. Set min value to 0
3. Set max value to 100
4. Change label
5. Verify all changes persist

### Scenario 4: Search & Filter

1. Type "email" in the component search
2. Verify only email input is shown
3. Clear search
4. Type "text" - verify multiple results
5. Search by tag (e.g., "input")

## Expected Output

When you click **Save**, you should see:

```json
{
  "metadata": {
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "version": "1.0.0",
    "author": "unknown"
  },
  "version": "1.0.0",
  "type": "form",
  "id": "builder-form",
  "name": "Form Builder",
  "config": {
    "formId": "builder-form",
    "rows": [
      {
        "id": "row-1",
        "fields": [
          {
            "id": "field-1",
            "componentId": "text",
            "props": {
              "label": "Full Name",
              "placeholder": "John Doe",
              "required": true
            }
          }
        ]
      }
    ]
  }
}
```

## Testing Checklist

- [ ] Component palette displays all components
- [ ] Search filters components correctly
- [ ] Components can be added to canvas
- [ ] Fields can be selected
- [ ] Field properties can be edited
- [ ] Property changes reflect immediately
- [ ] Fields can be removed
- [ ] Undo/Redo works correctly
- [ ] Save exports valid JSON
- [ ] Export downloads file
- [ ] Empty state shows when no fields
- [ ] No field selected state shows correctly
- [ ] UI is responsive and accessible
- [ ] No TypeScript errors
- [ ] No console errors

## Known Limitations (MVP)

❌ Not yet implemented:
- Drag & drop reordering
- Multi-field rows (columns)
- Field duplication
- Templates
- Import from JSON
- Real-time preview with actual components
- Field validation rules
- Conditional visibility
- Custom field types at runtime

These features are planned for Phase 2.

## Architecture Notes

The builder uses:
- **`visualBuilder`** - Pure TypeScript builder class (no React)
- **`useBuilderState`** - React hook for state management
- **`FormBuilder`** - Main React component
- **Immutable updates** - All changes create new instances
- **Type-safe** - Full TypeScript inference

All form configurations are compatible with `@rilaykit/forms` and can be used directly with the `<Form>` component.

## Troubleshooting

### Build Errors

If you see build errors:
```bash
cd /Users/karl/Documents/rilay
pnpm build
```

### Type Errors

If TypeScript complains about builder types:
```bash
cd packages/core && pnpm build
cd packages/builder && pnpm build
cd apps/playground && pnpm type-check
```

### Styles Not Loading

Make sure Tailwind CSS is configured correctly and the dev server is running.

### Components Not Showing

Verify that components have the `builder` metadata in their configuration:
```typescript
.addComponent('text', {
  name: 'Text Input',
  renderer: TextInput,
  builder: {
    category: 'Inputs',
    icon: '📝',
    editableProps: [...]
  }
})
```

## Feedback

Report issues or suggestions:
- Create an issue on GitHub
- Check console for errors
- Verify TypeScript types
- Test in latest Chrome/Firefox

---

**Happy Building! 🎉**




