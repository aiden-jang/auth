// wrangler bundles `*.wasm` imports into a WebAssembly.Module (handed to resvg's initWasm).
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
