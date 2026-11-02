import { CopilotChatAssistantMessage } from "@copilotkit/react-core/v2";
import type { ComponentProps } from "react";
import type { CopilotCitation } from "../copilot/contracts";
import type { CopilotAnswerContext, CopilotCitationSelection } from "./CopilotKitChatSurface";

const CITATION_URL_PREFIX = "https://lattice.invalid/citation/";
const CITATION_MARKER = /\(cite:([^:()\s]+):([^()\s]+)\)/g;

function escapeMarkdownLabel(label: string): string {
  return label.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

export function formatAnswerCitations(
  content: string,
  citations: readonly CopilotCitation[],
): string {
  const citationsById = new Map(citations.map((citation) => [citation.citationId, citation]));

  return content.replace(CITATION_MARKER, (marker, kind: string, encodedId: string) => {
    const citation = citationsById.get(`cite:${kind}:${encodedId}`);
    if (!citation) return marker;
    return `[${escapeMarkdownLabel(citation.label)}](${CITATION_URL_PREFIX}${encodeURIComponent(citation.citationId)})`;
  });
}

type CitationAnchorProps = ComponentProps<"a"> & { node?: unknown };

export function CopilotAnswerContent({
  content,
  answerContext,
  onCitationSelect,
}: {
  content: string;
  answerContext?: CopilotAnswerContext;
  onCitationSelect: (selection: CopilotCitationSelection) => void;
}) {
  return (
    <CopilotAnswerContentBody
      content={content}
      answerContext={answerContext}
      onCitationSelect={onCitationSelect}
    />
  );
}

function CopilotAnswerContentBody({
  content,
  answerContext,
  onCitationSelect,
}: {
  content: string;
  answerContext?: CopilotAnswerContext;
  onCitationSelect: (selection: CopilotCitationSelection) => void;
}) {
  const citationsById = new Map(
    (answerContext?.answer.citations ?? []).map((citation) => [citation.citationId, citation]),
  );
  const components: NonNullable<
    ComponentProps<typeof CopilotChatAssistantMessage.MarkdownRenderer>["components"]
  > = {
    a: (anchorProps: CitationAnchorProps) => {
      const { href, children, node, ...props } = anchorProps;
      void node;
      if (href?.startsWith(CITATION_URL_PREFIX)) {
        let citationId: string;
        try {
          citationId = decodeURIComponent(href.slice(CITATION_URL_PREFIX.length));
        } catch {
          return <span>{children}</span>;
        }

        const citation = citationsById.get(citationId);
        if (!citation || !answerContext) return <span>{children}</span>;

        return (
          <button
            type="button"
            className="inline rounded-sm font-medium text-cyan-800 underline decoration-cyan-700/60 underline-offset-4 transition-colors duration-150 ease-out hover:text-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 dark:text-cyan-200 dark:decoration-cyan-300/60 dark:hover:text-cyan-100 dark:focus-visible:outline-cyan-300"
            aria-label={`Open ${citation.kind} reference: ${citation.label}`}
            onClick={() => onCitationSelect({ ...answerContext, citation })}
          >
            {children}
          </button>
        );
      }

      return (
        <a {...props} href={href}>
          {children}
        </a>
      );
    },
  };
  return (
    <div className="copilot-answer-content w-full max-w-none break-words text-[15px] leading-7 text-slate-800 dark:text-slate-100 [&_.copilotKitMarkdown]:leading-7 [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-semibold [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_strong]:font-semibold">
      <CopilotChatAssistantMessage.MarkdownRenderer
        content={formatAnswerCitations(content, answerContext?.answer.citations ?? [])}
        components={components}
      />
    </div>
  );
}
