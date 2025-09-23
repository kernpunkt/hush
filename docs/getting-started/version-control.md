---
icon: versions
title: Version Control
order: 75
author:
  name: Ingo Hachelbusch
  link: https://github.com/ingohachelbusch
---

# Version Control in Hush

Hush implements a version control system that ensures developers avoid conflicts from different versions.

## Overview

The version control system in Hush works on three levels:

1. **Secret Versioning**: Each secret in AWS SecretsManager is automatically versioned
2. **Local Version Tracking**: The `versions.json` file tracks local versions
3. **Conflict Prevention**: Automatic checks before push operations

## Local Version Tracking

### versions.json File

Hush automatically creates a `versions.json` file in your project directory:

```json
{
  "hush-project-dev": {
    "version": 5
  },
  "hush-project-prod": {
    "version": 12
  },
  "hush-api-keys": {
    "version": 3
  }
}
```

**Note:**
- The `versions.json` file is automatically updated during `pull` operations
- The `versions.json` file is used for conflict checking during `push` operations

## Version Control in Push Operations

### Automatic Version Checking

With every `hush push`, the system goes through the following process:

1. **Retrieve Current Version**: Loads the current version from AWS SecretsManager
2. **Check Local Version**: Compares with the version in `versions.json`
3. **Conflict Detection**: Warns about conflicts and prevents unintended overwrites
4. **Version Increment**: Automatically increases the version number by 1
5. **Update Local Tracking**: Updates the `versions.json` file

### Example Push Workflow

```bash
# Current version in AWS: 5
# Local version in versions.json: 3

hush push my-project .env
# ⚠️ Warning: Current version (5) is greater than your current version (3)
# ⚠️ Use "hush pull" to pull the latest version first

# Solution 1: Pull latest version
hush pull my-project .env
# Local version is updated to 5

hush push my-project .env
# ✅ Success! Version is incremented to 6

# Solution 2: Use force flag (only when sure)
hush push my-project .env --force
# ⚠️ May overwrite newer changes!
```

## Version Control in Pull Operations

### Pull Workflow

1. **Read Local File**: Analyzes the current `.env` file
2. **Retrieve Remote Version**: Loads the latest version from AWS
3. **Detect Changes**: Compares local and remote versions
4. **Request Confirmation**: Shows changes before overwriting
5. **Update Version**: Updates `versions.json` after successful pull