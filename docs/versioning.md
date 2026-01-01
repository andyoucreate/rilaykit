# Versioning Strategy

This monorepo uses **Semantic Versioning 2.0.0** for all packages with synchronized versions.

## Current Version: `15.0.0`

---

## Version Format

```
MAJOR.MINOR.PATCH[-PRERELEASE]
```

### Examples

- `14.0.0-alpha.1` - Alpha version 1
- `14.0.0-beta.2` - Beta version 2
- `14.0.0-rc.1` - Release Candidate 1
- `14.0.0` - Stable release

---

## Semantic Versioning Rules

### MAJOR (X.0.0)

Increment when you make incompatible API changes:
- Removing or renaming public API
- Changing function/component signatures
- Breaking type changes
- Removing deprecated features

### MINOR (0.X.0)

Increment when you add functionality in a backwards-compatible manner:
- New features
- New optional parameters
- New components or hooks
- Deprecating (but not removing) features

### PATCH (0.0.X)

Increment when you make backwards-compatible bug fixes:
- Bug fixes
- Performance improvements
- Documentation updates
- Internal refactoring (no API changes)

---

## Package Versioning Strategy

All packages in the monorepo share the **same version**:

```json
{
  "@rilaykit/core": "15.0.0",
  "@rilaykit/forms": "15.0.0",
  "@rilaykit/workflow": "15.0.0"
}
```

### Why Synchronized Versions?

- **Consistency**: Avoids confusion between package versions
- **Simplicity**: Single version number for the entire project
- **Clarity**: Easy communication (e.g., "RilayKit v14.0.0")
- **Compatibility**: Guarantees all packages work together

### How It Works with Changesets

Changesets handles this automatically when configured with `"fixed"` groups:

```json
// .changeset/config.json
{
  "fixed": [["@rilaykit/core", "@rilaykit/forms", "@rilaykit/workflow"]]
}
```

When any package gets a version bump, all packages in the fixed group are bumped together.

---

## Lifecycle Phases

### Phase 1: Development

**Characteristics:**
- Rapid iteration
- Breaking changes expected
- Internal testing only

**Workflow:**
1. Make changes
2. Create changeset: `pnpm changeset`
3. Continue development

---

### Phase 2: Alpha (`X.Y.Z-alpha.N`)

**Characteristics:**
- API in active development
- Breaking changes possible between versions
- Early adopter testing
- No stability guarantee

**When to use:**
- New major features in development
- Significant API redesigns
- Experimental functionality

**Commands:**
```bash
pnpm prerelease alpha
pnpm changeset
pnpm changeset:version
pnpm release:alpha
```

---

### Phase 3: Beta (`X.Y.Z-beta.N`)

**Characteristics:**
- API stabilized (minor changes possible)
- Testing with pilot users
- Complete documentation
- Limited and documented breaking changes

**Exit criteria for RC:**
- No critical open bugs
- Documentation complete
- Core functionality validated

**Commands:**
```bash
pnpm prerelease beta
pnpm changeset
pnpm changeset:version
pnpm release:beta
```

---

### Phase 4: Release Candidate (`X.Y.Z-rc.N`)

**Characteristics:**
- API frozen (no breaking changes)
- Production ready
- Only critical bug fixes

**Exit criteria for Stable:**
- No critical bugs for 1-2 weeks
- Performance validated
- All tests passing

---

### Phase 5: Stable (`X.Y.Z`)

**Characteristics:**
- Official production ready
- Stable and documented API
- Full support provided

**Commands:**
```bash
pnpm prerelease:exit
pnpm changeset:version
pnpm release
```

---

## Changesets Workflow

### 1. Creating a Changeset

After making changes, document them:

```bash
pnpm changeset
```

This interactive CLI will ask:
1. **Which packages changed?** (Select affected packages)
2. **Version bump type?** (major/minor/patch)
3. **Summary?** (Describe changes for CHANGELOG)

A markdown file is created in `.changeset/`:

```markdown
---
"@rilaykit/core": minor
"@rilaykit/forms": minor
---

Add new useFormState hook for advanced form state management
```

### 2. Versioning

When ready to release:

```bash
pnpm changeset:version
```

This will:
- Consume all changeset files
- Update `package.json` versions
- Update `CHANGELOG.md` files
- Determine the highest bump type for synchronized packages

### 3. Publishing

```bash
pnpm release
```

---

## Prerelease Mode

### Entering Prerelease

```bash
# Enter alpha mode
pnpm prerelease alpha

# Or beta mode
pnpm prerelease beta
```

While in prerelease mode:
- All version bumps include the prerelease tag
- `patch` bump: `14.0.0-alpha.1` → `14.0.0-alpha.2`
- Exiting adds the next version: `14.0.0-alpha.3` → `14.0.0` or `14.1.0`

### Exiting Prerelease

```bash
pnpm prerelease:exit
pnpm changeset:version
```

---

## Version Workflow Examples

### Example: Bug Fix Release

```bash
# 1. Fix the bug in code
git checkout -b fix/form-validation

# 2. Create changeset
pnpm changeset
# Select: @rilaykit/forms
# Type: patch
# Summary: "Fix validation error not clearing on field change"

# 3. Commit
git add .
git commit -m "fix(forms): validation error not clearing on field change"

# 4. Merge to main, then version and publish
pnpm changeset:version
git add .
git commit -m "chore: release v14.0.1"
pnpm release
```

### Example: New Feature Release

```bash
# 1. Develop feature
git checkout -b feat/conditional-fields

# 2. Create changeset
pnpm changeset
# Select: @rilaykit/core, @rilaykit/forms
# Type: minor
# Summary: "Add conditional field visibility based on form values"

# 3. Commit and merge
git add .
git commit -m "feat(core): add conditional field visibility"

# 4. Version and publish
pnpm changeset:version
git add .
git commit -m "chore: release v14.1.0"
pnpm release
```

### Example: Breaking Change Release

```bash
# 1. Make breaking changes
git checkout -b feat/new-api

# 2. Create changeset
pnpm changeset
# Select: all packages
# Type: major
# Summary: "Redesign Form component API for better TypeScript inference"

# 3. Commit and merge
git add .
git commit -m "feat!: redesign Form component API"

# 4. Version and publish
pnpm changeset:version
git add .
git commit -m "chore: release v15.0.0"
pnpm release
```

---

## Roadmap

| Version | Status | Milestone |
|---------|--------|-----------|
| 15.0.0 | Current | Zustand-based state management |
| 15.1.0 | Planned | Enhanced condition system |
| 15.2.0 | Planned | Performance optimizations |
| 16.0.0 | Future | React 19 full support, API improvements |

---

## Changelog

Each package maintains its own `CHANGELOG.md`:

- [`packages/core/CHANGELOG.md`](../packages/core/CHANGELOG.md)
- [`packages/forms/CHANGELOG.md`](../packages/forms/CHANGELOG.md)
- [`packages/workflow/CHANGELOG.md`](../packages/workflow/CHANGELOG.md)

Changelogs are automatically updated when running `pnpm changeset:version`.

---

## Changesets Configuration

The `.changeset/config.json` should be configured as:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/changelog-github",
  "commit": false,
  "fixed": [["@rilaykit/core", "@rilaykit/forms", "@rilaykit/workflow"]],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

### Configuration Options

| Option | Value | Description |
|--------|-------|-------------|
| `changelog` | `@changesets/changelog-github` | GitHub-style changelog with PR links |
| `commit` | `false` | Don't auto-commit version changes |
| `fixed` | `[["@rilaykit/*"]]` | All packages share the same version |
| `access` | `restricted` | Private packages (organization only) |
| `baseBranch` | `main` | Default branch for comparisons |
| `updateInternalDependencies` | `patch` | Auto-bump dependents on patch |

---

## Best Practices

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new validation hook
fix: resolve form reset issue
docs: update API documentation
chore: release v14.1.0
feat!: breaking change to Form API
```

### Changeset Descriptions

Write clear, user-facing descriptions:

```markdown
---
"@rilaykit/forms": minor
---

Add `useFormReset` hook for programmatic form reset

This hook provides a clean way to reset form state without
re-mounting the component. Useful for multi-step forms.
```

### Version Bumps

- **patch**: Bug fixes, typos, internal changes
- **minor**: New features, new exports, deprecations
- **major**: Breaking changes, removed features, API redesigns

---

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Changesets Documentation](https://github.com/changesets/changesets)
- [Publishing Guide](./publishing.md)

