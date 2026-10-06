// web-ext ships no type declarations; the install tests only use the
// programmatic `cmd.{lint,build,run}` API and narrow the results themselves.
declare module 'web-ext' {
  export const cmd: {
    lint(params: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
    build(params: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
    run(params: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  };
  export function main(...args: unknown[]): Promise<unknown>;
  const webExt: { cmd: typeof cmd; main: typeof main };
  export default webExt;
}
