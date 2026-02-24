# @rilaykit/forms Reference

## Table of Contents

- [Form Builder](#form-builder)
- [Builder Methods](#builder-methods)
- [Field Configuration](#field-configuration)
- [Components](#components)
- [Field Hooks](#field-hooks)
- [Form Hooks](#form-hooks)
- [Condition Hooks](#condition-hooks)
- [Real-World Patterns](#real-world-patterns)

## Form Builder

Create forms with the fluent builder API. All builder methods return new instances (immutable).

```typescript
import { form } from "@rilaykit/forms";

// Create a form with an ID
const loginForm = form
  .create(r, "login")
  .add(
    { id: "email", type: "input", props: { label: "Email" }, validation: { validate: [required(), email()] } },
    { id: "password", type: "input", props: { type: "password" }, validation: { validate: [required()] } },
  );

// Create a form without specifying an ID (auto-generated)
const simpleForm = form
  .create(r)
  .add({ id: "email", type: "input" });
```

### Row Layout Rules

- Fields in the **same `.add()` call** render on the **same row** (max 3 fields).
- Separate `.add()` calls create **separate rows**.

```typescript
form.create(r, "example")
  .add(field1)                         // Row 1: field1 alone
  .add(field2, field3)                 // Row 2: field2 + field3 side by side
  .add(field4, field5, field6);        // Row 3: three fields side by side
```

Force each field on its own row:

```typescript
builder.addSeparateRows([field1, field2, field3]);
// Equivalent to: .add(field1).add(field2).add(field3)
```

## Builder Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `.add(field1, field2?, field3?)` | new builder | Add 1-3 fields on the same row |
| `.add([fields], options?)` | new builder | Add fields from array |
| `.addSeparateRows(fields)` | new builder | Each field on its own row |
| `.setId(newId)` | new builder | Change form ID |
| `.setValidation(config)` | new builder | Set form-level validation |
| `.addFieldConditions(fieldId, conds)` | new builder | Add conditions to existing field |
| `.updateField(fieldId, updates)` | new builder | Update field properties |
| `.removeField(fieldId)` | new builder | Remove a field |
| `.getField(fieldId)` | `FieldConfig \| undefined` | Get field config |
| `.getFields()` | `FieldConfig[]` | Get all fields |
| `.getRows()` | `Row[]` | Get all rows with their fields |
| `.clear()` | new builder | Remove all fields |
| `.validate()` | `string[]` | Return validation errors |
| `.getStats()` | stats object | Form statistics |
| `.toJSON()` | serializable object | Serialize for storage |
| `.fromJSON(json)` | new builder | Deserialize |
| `.clone(newId?)` | new builder | Deep copy |
| `.build()` | `FormConfig` | Build final config |

## Field Configuration

```typescript
interface FieldConfig {
  id: string;                           // Unique field identifier
  type: string;                         // Registered component type
  props?: Record<string, any>;          // Props passed to renderer
  validation?: {
    validate?: StandardSchema | StandardSchema[];
    validateOnChange?: boolean;
    validateOnBlur?: boolean;
    debounceMs?: number;
  };
  conditions?: {
    visible?: ConditionConfig;          // Show/hide field
    required?: ConditionConfig;         // Dynamic required
    disabled?: ConditionConfig;         // Disable field
    readonly?: ConditionConfig;         // Read-only
  };
}
```

## Components

### Form (root wrapper)

```typescript
import { Form, FormBody, FormField, FormSubmitButton, FormProvider } from "@rilaykit/forms";

<Form
  formConfig={loginForm}                // Builder instance or built config
  onSubmit={(data) => { ... }}          // Submit handler
  onFieldChange={(fieldId, value, allData) => { ... }}  // Optional change callback
  defaultValues={{ email: "", password: "" }}
  className="my-form"
>
  <FormBody />                          // Auto-render all rows
  <FormSubmitButton>Sign In</FormSubmitButton>
</Form>
```

### FormBody

Renders all rows using the configured `bodyRenderer` and `rowRenderer`.

```typescript
<FormBody />
```

### FormField (custom layout)

Render individual fields for custom layouts:

```typescript
<Form formConfig={myForm} onSubmit={handleSubmit}>
  <div className="grid grid-cols-2 gap-4">
    <FormField fieldId="firstName" />
    <FormField fieldId="lastName" />
  </div>
  <FormField fieldId="email" />
  <FormSubmitButton>Save</FormSubmitButton>
</Form>
```

FormField props:

```typescript
<FormField
  fieldId="email"                       // Required: matches field config ID
  disabled={true}                       // Override disabled state
  customProps={{ ... }}                 // Override/extend field props
  className="mb-4"
  forceVisible={true}                   // Bypass visibility conditions
/>
```

### FormSubmitButton

```typescript
// Simple
<FormSubmitButton>Save</FormSubmitButton>

// Render function for dynamic content
<FormSubmitButton>
  {(props) => props.isSubmitting ? "Saving..." : "Save"}
</FormSubmitButton>
```

## Field Hooks

All field hooks take a field ID and only re-render when that specific field changes.

```typescript
import {
  useFieldValue,
  useFieldErrors,
  useFieldTouched,
  useFieldValidationState,
  useFieldConditions,
  useFieldState,
  useFieldActions,
} from "@rilaykit/forms";

// Value
const email = useFieldValue<string>("email");

// Errors
const errors = useFieldErrors("email");         // FieldError[] | undefined

// Touch state
const touched = useFieldTouched("email");       // boolean

// Validation state
const state = useFieldValidationState("email"); // "idle" | "validating" | "valid" | "invalid"

// Conditions
const conds = useFieldConditions("email");
// → { visible: boolean, disabled: boolean, required: boolean, readonly: boolean }

// All field state at once
const { value, errors, validationState, touched, dirty } = useFieldState("email");

// Actions (stable references, never cause re-renders)
const { setValue, setTouched, setErrors, clearErrors, setValidationState } = useFieldActions("email");
setValue("new@email.com");
setTouched();
setErrors([{ message: "Invalid" }]);
clearErrors();
```

## Form Hooks

```typescript
import {
  useFormSubmitting,
  useFormValid,
  useFormDirty,
  useFormValues,
  useFormSubmitState,
  useFormActions,
  useFormConfigContext,
} from "@rilaykit/forms";

// Individual state slices (prefer these for performance)
const isSubmitting = useFormSubmitting();        // boolean
const isValid = useFormValid();                  // boolean
const isDirty = useFormDirty();                  // boolean
const allValues = useFormValues();               // Record<string, unknown>

// Combined submit state
const { isSubmitting, isValid, isDirty } = useFormSubmitState();

// Actions (stable references, never cause re-renders)
const { setValue, reset, setSubmitting, setFieldConditions } = useFormActions();
setValue("fieldId", "newValue");
reset();                                         // Reset to defaults
reset({ fieldId: "value" });                     // Reset with specific values
setSubmitting(true);
setFieldConditions("fieldId", { visible: true });

// Full context (re-renders on ANY change — use sparingly)
const {
  formConfig,
  conditionsHelpers,
  validateField,
  validateForm,
  submit,
} = useFormConfigContext();
```

## Condition Hooks

```typescript
import {
  useConditionEvaluation,
  useFormConditions,
  useFieldConditionsLazy,
  useConditionEvaluator,
} from "@rilaykit/forms";

// Evaluate conditions for a single field
const { visible, disabled, required, readonly } = useConditionEvaluation(
  fieldConfig.conditions,
  formData,
  { visible: true },                            // Defaults
);

// Evaluate all fields' conditions
const {
  fieldConditions,
  hasConditionalFields,
  getFieldCondition,
  isFieldVisible,
  isFieldDisabled,
  isFieldRequired,
  isFieldReadonly,
} = useFormConditions({ formConfig, formValues });

// Lazy evaluation with caching
const conditions = useFieldConditionsLazy("myField", {
  conditions: fieldConfig.conditions,
  skip: false,
});

// Memoized evaluator for on-demand evaluation
const evaluate = useConditionEvaluator();
const conds = evaluate("name", nameFieldConfig.conditions);
```

## Real-World Patterns

### Dependent combobox with TanStack Query

```typescript
export const DependentComboboxRenderer = (renderProps: FieldProps) => {
  const values = useFormValues();
  const dependsOn = renderProps.props?.dependsOn as string;
  const dependsOnValue = dependsOn ? (values?.[dependsOn] as string) : undefined;
  const debouncedValue = useDebouncedValue(dependsOnValue, 300);

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["dependent-combobox", renderProps.props?.optionsEndpoint, debouncedValue],
    queryFn: async () => {
      const { data } = await api.get(`${renderProps.props.optionsEndpoint}?${dependsOn}=${debouncedValue}`);
      return data as SelectOption[];
    },
    enabled: Boolean(renderProps.props?.optionsEndpoint && debouncedValue),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <ComboBox
      value={options.find((o) => o.value === renderProps.value)}
      onChange={(option) => renderProps.onChange?.(option?.value)}
      options={options}
      isLoading={isLoading}
      isDisabled={renderProps.disabled || !dependsOnValue}
    />
  );
};
```

### Toggle group with auto-submit in workflows

```typescript
export const ToggleGroupRenderer = (renderProps: FieldProps) => {
  const { goNext } = useWorkflowContext();

  const handleValueChange = (value: string) => {
    renderProps.onChange?.(value);
    if (value && renderProps.props?.autoSubmit) {
      setTimeout(() => goNext(), 100);
    }
  };

  return (
    <ToggleGroup value={renderProps.value} onValueChange={handleValueChange}>
      {renderProps.props?.options.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value}>{opt.label}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
};
```

### Form with prefix/suffix on inputs

```typescript
.add({
  id: "revenues",
  type: "text",
  props: {
    label: "Annual Revenue",
    placeholder: "Enter amount",
    prefix: <Euro className="size-4" />,
  },
  validation: {
    validate: [z.string().regex(/^\d+$/, "Invalid amount")],
  },
})
```

### Dynamic form from external configuration

```typescript
import { form } from "@rilaykit/forms";

// Transform external field config into RilayKit form
let sectionForm = form.create(r, "dynamic-section");

for (const field of sortedFields) {
  sectionForm = sectionForm.add({
    id: field.key,
    type: mapFieldType(field.type),
    props: { label: field.label, placeholder: field.placeholder, options: field.options },
    validation: { validate: createFieldValidators(field) },
    conditions: field.showWhen ? { visible: createRilayCondition(field.showWhen) } : undefined,
  });
}
```
