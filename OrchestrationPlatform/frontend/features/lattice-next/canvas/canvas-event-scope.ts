export function isCanvasEventForScope(
  eventScopeId: string | undefined,
  canvasScopeId: string,
): boolean {
  return eventScopeId === undefined
    ? canvasScopeId === "main"
    : eventScopeId === canvasScopeId;
}
