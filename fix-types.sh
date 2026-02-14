#!/bin/bash

# Fix req.params.id -> getStringParam(req.params.id)!
find src/modules -name "*.controller.ts" -exec sed -i '' \
  -e 's/const { id } = req\.params;/const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)!;/g' \
  {} \;

echo "✓ Fixed all req.params.id"
