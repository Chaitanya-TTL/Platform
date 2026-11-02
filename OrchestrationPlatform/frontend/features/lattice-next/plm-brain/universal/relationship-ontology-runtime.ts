import "server-only";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRelationshipOntology } from "./relationship-ontology-parser";

const relationshipDocumentPath = resolve(process.cwd(), "..", "docs", "relationships.md");

export function loadRelationshipOntology() {
  const markdown = readFileSync(relationshipDocumentPath, "utf8");
  return parseRelationshipOntology(markdown);
}
