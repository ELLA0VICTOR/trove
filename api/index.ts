import { createServerlessHandler } from "../server/serverless.ts";
const handler = createServerlessHandler();
export default { fetch: handler.fetch };
