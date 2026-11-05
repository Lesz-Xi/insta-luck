import { productionApi } from "../../hosted/production.js";

export function GET(request: Request): Promise<Response> {
  return productionApi().media(request);
}
