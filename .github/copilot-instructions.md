# Test Repository - GitHub Copilot Instructions

This is a minimal test repository containing only a basic GitHub Actions workflow. Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Repository Overview
This repository is a basic test repository created to demonstrate GitHub Actions functionality. It contains:
- A single GitHub Actions workflow file (`.github/workflows/blank.yml`)
- No application code, dependencies, or build systems
- No README, package.json, or other project files

## Working Effectively

### Repository Structure
The repository contains only the following files:
```
.
├── .github/
│   └── workflows/
│       └── blank.yml    # Basic CI workflow that echoes "Hello, world!"
└── .git/                # Git metadata
```

### Basic Commands
Since this is a minimal repository, there are no build, test, or run commands for application code. The following basic commands work:

- Navigate to repository: `cd /path/to/repository`
- Check repository status: `git --no-pager status`
- View workflow file: `cat .github/workflows/blank.yml`
- Test basic functionality: `echo "Hello, world!"` -- completes instantly

### GitHub Actions Workflow
The repository contains a basic CI workflow that:
- Triggers on push/PR to main branch
- Can be manually triggered via workflow_dispatch
- Runs on ubuntu-latest
- Executes two simple steps:
  1. Checks out the repository
  2. Runs echo commands that print "Hello, world!" and additional messages

**Workflow Validation**: The workflow commands can be tested locally:
```bash
echo "Hello, world!"
echo "Add other actions to build,"
echo "test, and deploy your project."
```
These commands complete instantly with no timeout concerns.

## Validation Steps
When working with this repository:
1. **Always verify the workflow file syntax** by checking `.github/workflows/blank.yml`
2. **Test any echo commands locally** before modifying the workflow
3. **Check git status** to ensure changes are tracked properly
4. **Validate YAML syntax** if modifying the workflow file

## Adding New Features
Since this is a minimal repository, you may need to add:

### For a Node.js Project
1. Create `package.json`: `npm init -y`
2. Install dependencies: `npm install [package-name]`
3. Add build scripts to package.json
4. Update GitHub Actions workflow to include Node.js setup

### For a Python Project  
1. Create `requirements.txt` for dependencies
2. Create `setup.py` or `pyproject.toml` for project configuration
3. Add Python setup to GitHub Actions workflow

### For Any Project Type
1. **Always create a README.md** to document the project
2. **Add a .gitignore** file appropriate for the project type
3. **Update the GitHub Actions workflow** to include actual build/test steps
4. **Set appropriate timeouts** for any build commands (60+ minutes for complex builds)

## GitHub Actions Workflow Modification Guidelines
When modifying `.github/workflows/blank.yml`:
- **Always validate YAML syntax** before committing
- **Use appropriate action versions** (e.g., `actions/checkout@v4`)
- **Add timeout values** for any commands that might take longer than 2 minutes
- **Include proper error handling** for build steps
- **Test workflow changes** on a feature branch first

## Current Limitations
- **No build system**: There are no build commands to run
- **No tests**: There are no test suites to execute  
- **No dependencies**: There are no package managers or dependency files
- **No application code**: This is purely a GitHub Actions demonstration repository

## Time Expectations
- **Repository exploration**: Instant (only 2 files to examine)
- **Workflow file changes**: Instant (simple text file editing)
- **Git operations**: Instant (minimal repository size)
- **Echo commands**: Instant execution

## Common Tasks Reference

### View repository contents
```bash
find . -type f -not -path './.git/*'
# Output: ./.github/workflows/blank.yml
```

### Check workflow file
```bash
cat .github/workflows/blank.yml
# Shows the complete GitHub Actions workflow configuration
```

### Validate basic commands
```bash
echo "Hello, world!"  # Should output: Hello, world!
git --no-pager status  # Should show current branch and status
```

## Development Workflow
1. **Clone repository**: Already provided in the working environment
2. **Make changes**: Edit files as needed (primarily `.github/workflows/blank.yml`)
3. **Test locally**: Run any echo commands or validation steps
4. **Commit changes**: Use `git add .` and `git commit -m "message"`
5. **Push changes**: Triggers the GitHub Actions workflow automatically

## Critical Reminders
- **This repository has no application code** - do not expect build or test commands
- **The workflow is purely demonstrative** - it only echoes messages
- **No timeout concerns** - all operations complete instantly
- **YAML validation is crucial** when modifying workflow files
- **Always test workflow syntax** before committing changes

## Troubleshooting
- **Workflow fails**: Check YAML syntax in `.github/workflows/blank.yml`
- **Git issues**: Use `git --no-pager status` to check repository state
- **File not found**: Remember this repository only contains the workflow file
- **Permission issues**: Ensure proper file permissions if adding new files

This repository serves as a foundation for learning GitHub Actions and can be extended with actual application code, build systems, and comprehensive CI/CD pipelines as needed.