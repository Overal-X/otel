const PACKAGE_MANAGER_SCRIPTS = /[\\/](?:npm-cli|npx-cli|yarn|yarnpkg|pnpm|pnpx|corepack)\.[cm]?js$/;

/**
 * Whether `script`, a process's `argv[1]`, is a package manager's CLI, such as npm running the
 * start script. Matched on the CLI file itself, so an app whose own path merely contains "npm"
 * is not mistaken for one.
 */
export function isPackageManager(script: string | undefined): boolean {
  return script !== undefined && PACKAGE_MANAGER_SCRIPTS.test(script);
}
