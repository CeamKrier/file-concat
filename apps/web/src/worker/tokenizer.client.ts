import { TiktokenModel } from "@dqbd/tiktoken";

import TokenizerWorker from "./tokenizer.worker.ts?worker";

export const calculateTotalTokens = (content: string, model: TiktokenModel): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") {
      reject(new Error("Web Workers are not supported in this environment."));

      return;
    }

    const worker = new TokenizerWorker();

    worker.onmessage = (e) => {
      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        resolve(e.data.tokens);
      }
      worker.terminate();
    };

    worker.onerror = (err) => {
      reject(new Error(`Worker error: ${err.message}`));
      worker.terminate();
    };

    worker.postMessage({ text: content, model });
  });
};
