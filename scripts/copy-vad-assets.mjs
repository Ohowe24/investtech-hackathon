// Copies the in-browser speech detector (Silero VAD) and its ONNX runtime into public/vad/, so Jarvis
// can tell when you start and stop talking without loading anything from a CDN. Runs after npm install;
// public/vad/ is git-ignored because the runtime is ~15 MB.
import { cpSync, existsSync, mkdirSync } from "node:fs";

const out = "public/vad";
mkdirSync(out, { recursive: true });
const files = [
  "node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js",
  "node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx",
  "node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx",
  "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
  "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
];
for (const f of files) {
  if (!existsSync(f)) {
    console.warn(`[copy-vad-assets] missing ${f}`);
    continue;
  }
  cpSync(f, `${out}/${f.split("/").pop()}`);
}
console.log(`[copy-vad-assets] ${files.length} files -> ${out}/`);
