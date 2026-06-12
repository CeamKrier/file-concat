import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { getRouterManifest } from "@tanstack/react-start/router-manifest";
import { getRouter } from "./router";

const handler = createStartHandler({
  createRouter: getRouter,
  getRouterManifest,
})(defaultStreamHandler);

export default {
  fetch: handler,
};
