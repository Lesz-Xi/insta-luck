import { productionApi } from "../hosted/production.js";

export function POST(request: Request): Promise<Response> {
  return productionApi().resolve(request);
}
