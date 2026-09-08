import { SirayaApiError } from "./siraya";

// Object identity is set only by the authenticated scene handler after quote
// validation. HTTP headers/body fields cannot grant this capability.
const sceneRequests = new WeakSet<object>();
export function authorizeSceneRequest<T extends object>(request: T): T {
  sceneRequests.add(request);
  return request;
}
export function assertModelAccess(request: object, model: unknown) {
  if (typeof model === "string" && /nsfw/i.test(model) && !sceneRequests.has(request)) {
    throw new SirayaApiError(403, "此模型僅供陪聊場景使用，請選擇一般生成模型。");
  }
}
