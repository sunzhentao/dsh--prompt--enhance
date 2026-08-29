// Global typings for the browser half (lib/client.js).
// DSH client runtime injects react and the module loader; keep minimal
// structural declarations here so `tsc --noEmit` can check the hand-written
// module-loader bundle without a real react package or DSH type package.

interface ModuleLoaderFactory {
  (require: (id: string) => unknown): {
    apply?: unknown
    inject?: string[]
    [key: string]: unknown
  }
}

interface DshModuleLoader {
  load(options: { id: string; factory: ModuleLoaderFactory }): void
}

interface Window {
  __ModuleLoader__: DshModuleLoader
}

declare module 'react' {
  export function createElement(type: unknown, props: unknown | null, ...children: unknown[]): unknown
  export function useState<S>(initial: S | (() => S)): [S, (value: S | ((prev: S) => S)) => void]
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void
  export function useRef<T = any>(initial: T | null): { current: T }
  export const Fragment: unknown
}
