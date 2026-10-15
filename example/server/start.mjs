import { createDemoServer } from "./server.mjs";

const server = await createDemoServer({
  host: process.env.A2UI_DEMO_HOST ?? "127.0.0.1",
  port: Number(process.env.A2UI_DEMO_PORT ?? "8080"),
});
console.log(`A2UI deterministic demo listening at ${server.url}`);
const stop = async () => {
  try {
    await server.close();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
