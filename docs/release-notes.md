# Release Notes

## v1.1.1

**Date**: 2023-08-15

- Added the `list` command
- Improved date formatting throughout the tool
- `pull` comamnd provides a comment at the top of the file, including the name of the secret

## v1.1.0

**Date**: 2023-08-15

- The `push` command now accepts a `-m, --message` parameter to save along with the secrets. A default message will be generated when no flag is provided. "Legacy" secrets without a message also don't generate an error
