#!/bin/bash

# Script to deprecate all versions except 0.1.0 and set 0.1.0 as latest
# Run with: ./scripts/deprecate-old-versions.sh [OTP_CODE]

set -e

OTP_CODE="$1"
OTP_FLAG=""

if [ -n "$OTP_CODE" ]; then
  OTP_FLAG="--otp=$OTP_CODE"
  echo "🔐 Using OTP code for authentication"
fi

DEPRECATION_MESSAGE="Deprecated. Please use version 0.1.0 which is the first stable release. See https://rilay.io"

PACKAGES=("@rilaykit/core" "@rilaykit/forms" "@rilaykit/workflow")

echo "🔄 Deprecating old versions and setting 0.1.0 as latest..."
echo ""

for PACKAGE in "${PACKAGES[@]}"; do
  echo "📦 Processing $PACKAGE..."
  
  # Deprecate all versions > 0.1.0 using semver range
  echo "  ⏳ Deprecating all versions except 0.1.0..."
  npm deprecate "$PACKAGE@>0.1.0" "$DEPRECATION_MESSAGE" $OTP_FLAG 2>/dev/null && echo "  ✅ Deprecated versions > 0.1.0" || echo "  ⚠️  Failed to deprecate (may need OTP)"
  
  # Also deprecate pre-release versions < 0.1.0
  npm deprecate "$PACKAGE@<0.1.0" "$DEPRECATION_MESSAGE" $OTP_FLAG 2>/dev/null && echo "  ✅ Deprecated versions < 0.1.0" || true
  
  # Remove alpha tag if exists
  echo "  ⏳ Removing alpha tag..."
  npm dist-tag rm "$PACKAGE" alpha $OTP_FLAG 2>/dev/null && echo "  ✅ Removed alpha tag" || echo "  ⚠️  No alpha tag or failed"
  
  # Set 0.1.0 as latest
  echo "  ⏳ Setting 0.1.0 as latest..."
  npm dist-tag add "$PACKAGE@0.1.0" latest $OTP_FLAG 2>/dev/null && echo "  ✅ Set 0.1.0 as latest" || echo "  ⚠️  Failed to set latest tag"
  
  echo ""
done

echo "✨ Done! Version 0.1.0 is now the stable release for all packages."
echo ""
echo "📋 Verify with:"
echo "   npm view @rilaykit/core"
echo "   npm view @rilaykit/forms"
echo "   npm view @rilaykit/workflow"
echo ""
echo "💡 If deprecation failed, run with OTP:"
echo "   ./scripts/deprecate-old-versions.sh YOUR_OTP_CODE"

