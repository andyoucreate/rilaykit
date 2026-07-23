// Registers jest-dom's custom matchers (`toBeInTheDocument`, `toHaveTextContent`,
// …) on Vitest's `expect`. `@testing-library/jest-dom` is a declared devDependency
// precisely for the React fallback tests; without this setup those matchers throw
// "Invalid Chai property", so every `render()`-based test fails to assert.
import '@testing-library/jest-dom/vitest';
