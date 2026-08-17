import type { SourceType } from "@/types/bom-comparison";

export type UserFacingError = {
  title: string;
  message: string;
  technicalDetails?: string;
  retryable: boolean;
  kind: "validation" | "not-found" | "connection" | "configuration" | "unexpected";
};

const sourceNames: Record<SourceType, string> = {
  teamcenter: "Teamcenter",
  windchill: "Windchill",
  sap: "SAP",
  configit: "Configit",
  excel: "Excel",
};

function cleanTechnicalMessage(value: string) {
  return value
    .replace(/job_[A-Za-z0-9_-]+/g, "the current request")
    .replace(/https?:\/\/\S+/g, "the service endpoint")
    .replace(/\b[A-Z]:\\[^\r\n]+/g, "the configured runtime path")
    .replace(/\s+/g, " ")
    .trim();
}

export function userFacingError(
  source: SourceType,
  raw: unknown,
  status?: number,
): UserFacingError {
  const original = raw instanceof Error ? raw.message : String(raw ?? "");
  const message = cleanTechnicalMessage(original);
  const name = sourceNames[source];
  const lower = message.toLowerCase();

  if (status === 404 || /not found|no final bom|no bom available|unavailable for/.test(lower)) {
    return {
      kind: "not-found",
      title: source === "sap" ? "No BOM structure found" : `${name} structure not found`,
      message:
        source === "sap"
          ? "SAP did not return a BOM structure for this material and plant. Business-impact information may still be available below."
          : `${name} did not return a structure for the submitted identifier. Review the request and try again.`,
      technicalDetails: original,
      retryable: false,
    };
  }

  if (status === 400 || /required|invalid|validation|must be different/.test(lower)) {
    return {
      kind: "validation",
      title: "Review the request",
      message: message || "One or more required values need attention before this request can continue.",
      technicalDetails: original,
      retryable: false,
    };
  }

  if (/connect|network|fetch|timeout|timed out|refused|unreachable|502|503|504/.test(lower)) {
    return {
      kind: "connection",
      title: `${name} is temporarily unavailable`,
      message: `The platform could not reach ${name}. Check the connection and try again.`,
      technicalDetails: original,
      retryable: true,
    };
  }

  if (/runtime|executable|script|configured|configuration|credentials|unauthorized|forbidden/.test(lower)) {
    return {
      kind: "configuration",
      title: `${name} needs attention`,
      message: `The ${name} integration is not ready to complete this request. Contact the platform administrator if the issue continues.`,
      technicalDetails: original,
      retryable: false,
    };
  }

  return {
    kind: "unexpected",
    title: `${name} request could not be completed`,
    message: "Something unexpected interrupted the request. Try again, or review the technical details if the issue continues.",
    technicalDetails: original,
    retryable: true,
  };
}

export function safeProgressMessage(source: SourceType, message?: string) {
  if (!message) return `Preparing ${sourceNames[source]} data...`;
  const lower = message.toLowerCase();
  if (lower.includes("connecting")) return `Connecting to ${sourceNames[source]}...`;
  if (lower.includes("compil")) return "Preparing the extraction runtime...";
  if (lower.includes("stock") || lower.includes("inventory") || lower.includes("cost")) return "Loading stock, inventory and cost information...";
  if (lower.includes("bom")) return "Building the product structure...";
  if (lower.includes("finaliz")) return "Finalizing the result...";
  return cleanTechnicalMessage(message);
}

export function sourceLabels(source: SourceType) {
  return {
    name: sourceNames[source],
    loading: source === "excel" ? "Understanding the workbook..." : `Loading ${sourceNames[source]} data...`,
  };
}
