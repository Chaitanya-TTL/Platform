export function retrievalCitationId(documentId: string, revision: string, chunkId: string): string {
  const components = [documentId, revision, chunkId];
  if (components.some((component) => typeof component !== "string" || !component.trim()))
    throw new Error("Retrieval citation components must be non-empty strings.");

  return `cite:retrieval-document:v1:${components.map(encodeURIComponent).join(":")}`;
}
