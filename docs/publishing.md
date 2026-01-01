# Publishing Guide

Guide for publishing `@rilaykit/*` packages to npm.

## Prerequisites

### 1. npm Account with Organization Access

You need an npm account with write permissions on the `@andyoucreate` organization:

```bash
# Login to npm
npm login

# Verify your connection
npm whoami
```

### 2. Organization Permissions

Ensure you have **write** access on the `@rilaykit` scope:
- Go to https://www.npmjs.com/settings/andyoucreate/teams
- Verify your account has the necessary permissions

### 3. Local Configuration

Create a `.npmrc` file at the project root (already in `.gitignore`):

```ini
# .npmrc
@rilaykit:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

**Option 1: Token in .npmrc (local development)**
```bash
# Get your token from https://www.npmjs.com/settings/YOUR_USERNAME/tokens
# Replace ${NPM_TOKEN} with your actual token in .npmrc
```

**Option 2: Environment variable (recommended)**
```bash
# Add to your ~/.zshrc or ~/.bashrc
export NPM_TOKEN="your-npm-token"
```

---

## Publishing Process

### Step 1: Pre-publication Checks

```bash
# 1. Verify all tests pass
pnpm test

# 2. Check linting
pnpm lint

# 3. Build all packages
pnpm build

# 4. Verify no uncommitted changes
git status
```

### Step 2: Create a Changeset

Document your changes using Changesets:

```bash
# Create a new changeset
pnpm changeset

# Follow the prompts:
# 1. Select packages that changed
# 2. Choose version bump type (major/minor/patch)
# 3. Write a summary of changes
```

This creates a markdown file in `.changeset/` describing your changes.

### Step 3: Version Packages

When ready to release, apply all pending changesets:

```bash
# Apply changesets and bump versions
pnpm changeset:version

# This will:
# - Update package.json versions
# - Update CHANGELOG.md files
# - Remove applied changeset files
```

### Step 4: Commit and Tag

```bash
# Review changes
git diff

# Commit version changes
git add .
git commit -m "chore: release v14.1.0"

# Push changes
git push origin main
```

### Step 5: Publish to npm

```bash
# Standard release (uses "latest" tag)
pnpm release

# Alpha releases
pnpm release:alpha

# Beta releases
pnpm release:beta
```

**Note:** Packages with `workspace:*` dependencies are automatically replaced with actual versions during publication.

---

## npm Tags

Use tags to publish different release channels:

```bash
# Alpha releases
pnpm release:alpha
# Users install with: npm install @rilaykit/core@alpha

# Beta releases
pnpm release:beta
# Users install with: npm install @rilaykit/core@beta

# Stable releases (uses "latest" tag by default)
pnpm release
# Users install with: npm install @rilaykit/core
```

### Managing Tags

```bash
# View all tags for a package
npm dist-tag ls @rilaykit/core

# Add/move a tag
npm dist-tag add @rilaykit/core@14.0.0 latest

# Remove a tag
npm dist-tag rm @rilaykit/core beta
```

---

## Post-publication Verification

### 1. Verify on npm

```bash
# Verify packages are published
npm view @rilaykit/core
npm view @rilaykit/forms
npm view @rilaykit/workflow

# Check latest version
npm info @rilaykit/core version

# Check all available versions
npm view @rilaykit/core versions
```

### 2. Test Installation

```bash
# In a test project
mkdir test-install && cd test-install
npm init -y
npm install @rilaykit/core@latest @rilaykit/forms@latest
```

### 3. Verify Private Access

Packages should be marked as **restricted** on npm and only accessible to members of the `@andyoucreate` organization.

---

## CI/CD Publishing

### GitHub Actions Workflow

```yaml
# .github/workflows/publish.yml
name: Publish to npm

on:
  push:
    branches:
      - main

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
          
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        
      - name: Run tests
        run: pnpm test
        
      - name: Build packages
        run: pnpm build
        
      - name: Create Release Pull Request or Publish
        id: changesets
        uses: changesets/action@v1
        with:
          publish: pnpm release
          version: pnpm changeset:version
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Secret Configuration:**
1. Go to Settings > Secrets and variables > Actions
2. Create a secret `NPM_TOKEN` with your npm automation token

---

## Troubleshooting

### Error: "You must sign up for private packages"

**Solution:**
- Your npm organization needs a paid plan for private packages
- Check at https://www.npmjs.com/settings/andyoucreate/billing

### Error: "403 Forbidden"

**Solutions:**
1. Verify you're logged in: `npm whoami`
2. Check your organization permissions
3. Regenerate your npm token if needed
4. Ensure the token has publish permissions

### Error: "Package already exists"

**Solution:**
- The version already exists on npm
- Create a new changeset and version again
- You cannot republish an existing version

### Error: "EPUBLISHCONFLICT"

**Solution:**
- Another publish is in progress
- Wait and retry, or check npm status at https://status.npmjs.org/

### Changesets not detecting changes

**Solutions:**
1. Ensure you're on the correct branch
2. Check if `.changeset/` folder exists
3. Verify changeset config in `.changeset/config.json`

---

## Security

### npm Tokens

- **NEVER** commit tokens to git
- Use tokens with limited scope (automation tokens recommended)
- Revoke unused tokens immediately
- Use different tokens for local development and CI/CD
- Enable 2FA on your npm account

### Token Types

| Type | Use Case | Scope |
|------|----------|-------|
| Publish | CI/CD automation | Limited to publish |
| Automation | CI/CD with 2FA bypass | Full publish access |
| Read-only | Installing private packages | Read only |

---

## Publication Checklist

Before each publication:

- [ ] All tests pass (`pnpm test`)
- [ ] No linting errors (`pnpm lint`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Changeset created for all changes (`pnpm changeset`)
- [ ] Versions applied (`pnpm changeset:version`)
- [ ] CHANGELOG.md files updated (automatic with changesets)
- [ ] Changes committed
- [ ] npm token configured and valid
- [ ] Packages built (`dist/` directories present)
- [ ] No sensitive files in packages (check `files` in package.json)

---

## Quick Reference

### Common Commands

```bash
# Create a changeset
pnpm changeset

# Apply changesets and bump versions
pnpm changeset:version

# Publish packages
pnpm release              # stable
pnpm release:alpha        # alpha tag
pnpm release:beta         # beta tag

# Enter/exit prerelease mode
pnpm prerelease alpha     # or beta
pnpm prerelease:exit
```

### Package Information

| Package | Description |
|---------|-------------|
| `@rilaykit/core` | Core types, configurations, and utilities |
| `@rilaykit/forms` | Form building components and hooks |
| `@rilaykit/workflow` | Multi-step workflow utilities (Premium) |

---

## Related Documentation

- [Versioning Strategy](./versioning.md) - Version strategy and roadmap
- [npm Private Packages](https://docs.npmjs.com/about-private-packages)
- [npm Organizations](https://docs.npmjs.com/orgs)
- [Changesets Documentation](https://github.com/changesets/changesets)
- [pnpm publish](https://pnpm.io/cli/publish)
- [Semantic Versioning](https://semver.org/)

