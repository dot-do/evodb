# Contributing to EvoDB

Thank you for your interest in contributing to EvoDB! This document provides guidelines and instructions for contributing.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/nathanclevenger/evodb.git
   cd evodb
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Build the project:
   ```bash
   pnpm build
   ```

4. Run tests:
   ```bash
   pnpm test
   ```

## TDD Workflow

We follow Test-Driven Development (TDD) practices:

1. **RED** - Write tests first that define the expected behavior
2. **GREEN** - Implement the minimal code necessary to make tests pass
3. **Refactor** - Improve the code with confidence, knowing tests will catch regressions

Use `bd create` for tracking issues during development.

## Code Style

- **TypeScript strict mode** - All code must pass strict type checking
- **ESLint configuration** - Follow the project's ESLint rules
- **Naming conventions**:
  - Use camelCase for variables and functions
  - Use PascalCase for classes and types
  - Use UPPER_SNAKE_CASE for constants
- **File organization**:
  - Keep related code together
  - One primary export per file when possible
  - Tests alongside source files or in `__tests__` directories

## Pull Request Process

1. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Write tests first** - Define expected behavior before implementation

3. **Implement changes** - Write the minimal code to make tests pass

4. **Run validation**
   ```bash
   pnpm test
   pnpm typecheck
   ```

5. **Create PR with description** - Clearly explain what changes were made and why

6. **Address review feedback** - Respond to comments and make requested changes

## Issue Tracking

- Use the `bd` CLI for beads workflow
- Reference issue IDs in commits (e.g., `fix(core): resolve edge case [evodb-a1r6]`)
- Keep issues updated with progress

## Questions?

If you have questions about contributing, please open an issue for discussion.
