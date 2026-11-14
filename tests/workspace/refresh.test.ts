import { test } from "node:test";
import { execFileSync } from "node:child_process";

test("workspace recovery refreshes shared layout and cached screens together", () => {
  execFileSync(
    process.execPath,
    [
      "--experimental-vm-modules",
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import ts from 'typescript';
    import { SourceTextModule, SyntheticModule } from 'node:vm';
    let layouts = 0;
    let screens = 0;
    let fail = false;
    const react = {
      createContext: () => ({}), useCallback: fn => fn,
      useContext() {}, useState() {}, useEffect() {}, useRef() {}, useSyncExternalStore() {},
    };
    const imports = {
      react,
      'react/jsx-runtime': { jsx() {}, jsxs() {} },
      swr: { SWRConfig() {}, useSWRConfig: () => ({ mutate: async predicate => {
        assert.equal(predicate('workspace-screen'), true);
        screens++;
        if (fail) throw new Error('Read unavailable');
      } }) },
      'next/navigation': { useRouter: () => ({ refresh() { layouts++; } }), unstable_rethrow() {} },
      '@/lib/supabase/client': { createClient() {} },
      '@/lib/workspace/screen-state': { ScreenState: class {} },
    };
    const source = ts.transpileModule(readFileSync('src/components/workspace/workspace-provider.tsx', 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX }
    }).outputText;
    const module = new SourceTextModule(source);
    await module.link(specifier => {
      const values = imports[specifier];
      assert.ok(values, 'Unexpected import ' + specifier);
      return new SyntheticModule(Object.keys(values), function () {
        for (const [name, value] of Object.entries(values)) this.setExport(name, value);
      });
    });
    await module.evaluate();
    const refresh = module.namespace.useRefreshWorkspace();
    await refresh();
    assert.equal(layouts, 1);
    assert.equal(screens, 1);
    fail = true;
    await refresh();
    assert.equal(layouts, 2);
    assert.equal(screens, 2);
  `,
    ],
    { stdio: "pipe" },
  );
});
