# @rilaykit/core Reference

## Table of Contents

- [ril Instance](#ril-instance)
- [Component Registry](#component-registry)
- [ComponentRenderProps Interface](#componentrenderprops-interface)
- [Renderers Configuration](#renderers-configuration)
- [Validation System](#validation-system)
- [Conditions System](#conditions-system)

## ril Instance

The `ril` instance is the central configuration object. Create one per app, register all components and renderers.

```typescript
import { ril } from "@rilaykit/core";

export const r = ril
  .create()
  .addComponent("input", { name: "Text Input", renderer: InputRenderer })
  .addComponent("select", { name: "Select", renderer: SelectRenderer })
  .configure({ fieldRenderer: FieldRenderer, bodyRenderer: BodyRenderer });
```

### Instance Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `.create()` | new instance | Create a fresh ril instance |
| `.addComponent(type, config)` | new instance | Register a component type |
| `.getComponent(type)` | `ComponentConfig \| undefined` | Get a registered component |
| `.getAllComponents()` | `ComponentConfig[]` | Get all registered components |
| `.hasComponent(type)` | `boolean` | Check if a component type exists |
| `.removeComponent(type)` | new instance | Remove a component type |
| `.configure(renderers)` | new instance | Set layout renderers |
| `.clear()` | new instance | Remove all components |
| `.clone()` | new instance | Deep copy the instance |
| `.validate()` | `string[]` | Return validation errors |
| `.getStats()` | `{ total, byType, hasCustomRenderers }` | Instance statistics |

### addComponent Config

```typescript
.addComponent("input", {
  name: "Text Input",                    // Display name
  renderer: InputRenderer,              // React component (required)
  defaultProps: { placeholder: "" },    // Default props merged with field props
  description: "A text input field",    // Optional description
  validation: {                         // Optional default validation
    validate: z.string().optional(),
  },
})
```

## Component Registry

### ComponentRenderProps Interface

Every renderer receives this props interface:

```typescript
interface ComponentRenderProps<TProps = any, TValue = any> {
  id: string;                           // Unique field ID
  value: TValue | undefined;            // Current field value
  onChange: (value: TValue) => void;     // Update value
  onBlur: () => void;                   // Trigger blur validation
  props: TProps;                        // Custom props from field config
  error?: FieldError[];                 // Validation errors array
  disabled?: boolean;                   // Disabled state
  context: FormContext;                 // Full form context
}

// FieldError shape
interface FieldError {
  message: string;
}
```

### Writing a Renderer

```typescript
import type { ComponentRenderProps } from "@rilaykit/core";

interface InputProps {
  label?: string;
  placeholder?: string;
  type?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const InputRenderer = (renderProps: ComponentRenderProps<InputProps>) => (
  <input
    id={renderProps.id}
    value={renderProps.value || ""}
    onChange={(e) => renderProps.onChange(e.target.value)}
    onBlur={renderProps.onBlur}
    disabled={renderProps.disabled}
    placeholder={renderProps.props?.placeholder}
    type={renderProps.props?.type || "text"}
  />
);
```

## Renderers Configuration

Configure layout renderers via `.configure()`:

```typescript
.configure({
  // Form renderers
  rowRenderer: RowRenderer,             // Wraps a row of fields
  bodyRenderer: BodyRenderer,           // Wraps all rows
  fieldRenderer: FieldRenderer,         // Wraps each field (label + error + input)
  submitButtonRenderer: SubmitButton,   // Submit button component

  // Workflow renderers
  stepperRenderer: StepperRenderer,     // Progress indicator
  nextButtonRenderer: NextButton,       // Next step button
  previousButtonRenderer: PrevButton,   // Previous step button
  skipButtonRenderer: SkipButton,       // Skip step button
})
```

### FieldRenderer Props

```typescript
interface FieldRendererProps {
  id: string;
  label?: string;
  description?: string;
  error?: FieldError[];
  children: React.ReactNode;            // The actual field component
  align?: "vertical" | "horizontal" | "horizontal-reverse";
}
```

## Validation System

### Built-in Validators

All validators return `StandardSchemaV1` and can be mixed with Zod, Yup, Valibot, ArkType.

```typescript
import {
  required, email, url, minLength, maxLength,
  pattern, number, min, max, custom, async, combine, combineSchemas,
} from "@rilaykit/core";

// Usage examples
required()                                     // "This field is required"
required("Custom message")
email("Valid email required")
minLength(8, "At least 8 chars")
maxLength(100)
pattern(/^[a-z0-9]+$/, "Lowercase only")
number("Must be a number")
min(18, "Must be 18+")
max(100)

// Custom sync validator
custom<string>((value) => value.includes("@"), "Must contain @")

// Custom async validator
async<string>(
  async (value) => {
    const res = await fetch(`/api/check?v=${value}`);
    return res.ok;
  },
  "Value already exists",
)

// Combine multiple validators into one
combine(required(), email(), minLength(5))
combineSchemas(schema1, schema2)               // Merge StandardSchema instances
```

### Field-Level Validation Config

```typescript
{
  id: "email",
  type: "input",
  validation: {
    validate: [required(), email()],    // Single validator or array
    validateOnChange: false,            // Validate on every keystroke
    validateOnBlur: true,               // Validate when field loses focus (recommended)
    debounceMs: 200,                    // Debounce validation (useful with async)
  },
}
```

### Form-Level Validation

Cross-field validation using Zod or any Standard Schema:

```typescript
import { form } from "@rilaykit/forms";

const passwordForm = form
  .create(r, "password-change")
  .add({ id: "password", type: "input" })
  .add({ id: "confirm", type: "input" })
  .setValidation({
    validate: z.object({
      password: z.string().min(8),
      confirm: z.string(),
    }).refine(
      (data) => data.password === data.confirm,
      { message: "Passwords don't match", path: ["confirm"] },
    ),
    validateOnSubmit: true,
  });
```

### Mixing Validation Libraries

```typescript
validation: {
  validate: [
    required("Required"),                 // RilayKit
    z.string().email("Invalid email"),    // Zod
    custom((v) => v.length > 3, "Too short"), // RilayKit custom
  ],
}
```

### Utility Functions

```typescript
import { isStandardSchema, combineSchemas } from "@rilaykit/core";

isStandardSchema(required())              // true
isStandardSchema(z.string())              // true
isStandardSchema("not a schema")          // false
```

## Conditions System

### `when()` Builder

Build conditional logic with a fluent API:

```typescript
import { when } from "@rilaykit/core";

// Basic comparisons
when("status").equals("active")
when("status").notEquals("inactive")
when("age").greaterThan(18)
when("price").lessThan(100)
when("score").greaterThanOrEqual(70)
when("discount").lessThanOrEqual(50)

// String operations
when("name").contains("John")
when("email").notContains("test")
when("phone").matches(/^\d{3}-\d{4}$/)

// Array/Set operations
when("products").contains("item-id")
when("status").in(["active", "pending"])
when("role").notIn(["admin", "super-admin"])

// Existence checks
when("companyName").exists()
when("optionalField").notExists()

// Nested paths (dot notation)
when("user.profile.age").greaterThan(18)
when("address.country").equals("US")
```

### Logical Operators

```typescript
// AND: all must be true
when("age").greaterThan(18)
  .and(when("status").equals("active"))

// OR: any can be true
when("type").equals("premium")
  .or(when("age").greaterThan(65))

// Complex nesting
when("type").equals("premium")
  .and(
    when("plan").equals("pro")
      .or(when("legacy").equals(true))
  )
```

### Terminal Methods

```typescript
const condition = when("type").equals("premium");

condition.build()                          // → ConditionConfig (serializable)
condition.evaluate({ type: "premium" })    // → true
```

### Field-Level Conditions

```typescript
{
  id: "companyName",
  type: "input",
  conditions: {
    visible: when("accountType").equals("business"),   // Show/hide field
    required: when("accountType").equals("business"),   // Dynamic required
    disabled: when("status").equals("verified"),         // Disable field
    readonly: when("status").equals("locked"),           // Read-only
  },
}
```

### Step-Level Conditions (Workflows)

```typescript
.addStep({
  id: "company-info",
  title: "Company Information",
  formConfig: companyForm,
  conditions: {
    visible: when("personal.userType").equals("business"),
    skippable: when("personal.hasCompanyData").equals(true),
  },
})
```

### Cross-Step Field References

In workflows, reference fields from other steps using `stepId.fieldId` dot notation:

```typescript
// Reference a field from the "products" step
when("products.requestedProducts").contains("provident")

// Reference nested data
when("familyStatus.familySituation").in(["married", "pacs"])
```
