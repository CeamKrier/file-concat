import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import mjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

/**
 * Speech recognition in its own worker (extraction router, D5), so a pass
 * that runs for minutes never holds the page. transformers.js on one wasm
 * thread, as the page is not cross-origin isolated. Weights come from the
 * Hugging Face hub once and then from the Cache API.
 *
 * One piece of audio per message, at most 30 s, cut by the caller: Moonshine
 * has no windowing of its own, and Whisper's computes every window's features
 * before the first one is read.
 */

export type SpeechRequest = {
  model: string;
  /** 16 kHz mono. */
  audio: Float32Array;
  /** Whisper's language code; absent for English-only Moonshine. */
  language?: string;
};

// Served from this site rather than transformers.js's default, jsDelivr, and the
// plain CPU build rather than its default WebGPU-capable one: 14 MB against 27,
// and the larger is over Cloudflare's 25 MiB limit on a static file.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = { mjs: mjsUrl, wasm: wasmUrl };

let loaded: { model: string; asr: Promise<AutomaticSpeechRecognitionPipeline> } | null = null;

self.onmessage = async ({ data }: MessageEvent<SpeechRequest>) => {
  try {
    if (loaded?.model !== data.model) {
      loaded = {
        model: data.model,
        asr: pipeline("automatic-speech-recognition", data.model, {
          // q8 throughout: the eval measured these exact weights (Moonshine base
          // 4.2 WER on long English talks, Whisper small 18.3 on Turkish).
          dtype: "q8",
          device: "wasm",
          progress_callback: (event) => {
            if (event.status === "progress") {
              self.postMessage({ progress: { file: event.file, loaded: event.loaded, total: event.total } });
            }
          },
        }) as Promise<AutomaticSpeechRecognitionPipeline>,
      };
    }
    const asr = await loaded.asr;
    const out = await asr(data.audio, data.language ? { language: data.language, task: "transcribe" } : {});
    self.postMessage({ result: (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text).trim() });
  } catch (error) {
    loaded = null;
    self.postMessage({ error: String(error) });
  }
};
