import { productionApi } from "../hosted/production.js";

export function GET(request: Request): Response {
  return productionApi().status(request);
}
