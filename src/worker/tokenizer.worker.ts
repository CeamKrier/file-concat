import { encoding_for_model, Tiktoken, TiktokenModel } from "@dqbd/tiktoken";

(async () => {
    self.onmessage = async (e: MessageEvent<{ text: string; model: TiktokenModel }>) => {
        const { text, model } = e.data;
        let encoder: Tiktoken | null = null;

        try {
            encoder = encoding_for_model(model);
            const tokens = encoder.encode(text);

            // Send the result back to the main thread
            self.postMessage({ tokens: tokens.length });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown worker error";
            self.postMessage({ error: errorMessage });
        } finally {
            // Ensure the encoder is freed to prevent memory leaks in the worker
            encoder?.free();
        }
    };

    // Signal that the worker is ready to receive messages
    self.postMessage({ ready: true });
})();
