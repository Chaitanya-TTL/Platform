# Enterprise Orchestration AI-Enabled Platform

*Slide-ready content | Working title; confirm naming before external use*

## Slide 5 — Internal Deployment: Requirements and Validation

**Management summary**

The proposed initial deployment is intended to run within the office network. IT and Procurement need to confirm which resources can be provided internally, which require purchase or subscription, and the associated cost. Availability, sourcing, and budget are pending validation.

| Resource area | Requirement / decision needed | Status |
|---|---|---|
| Server infrastructure | 1 Windows Server VM; 8 vCPU; 64 GB RAM; stable internal IP and office-network access | Internal availability / procurement: **Pending** |
| Storage | Expandable storage for extracts, results, logs, and configuration. Current slide conflicts: **250 GB** in the summary vs **2 TB expandable SSD** in the table; confirm sizing. | Capacity and cost: **Pending** |
| Network and security | Internal DNS and HTTPS/SSL; firewall and port approvals; secure connectivity to Teamcenter, SAP, Windchill, Configit, and ALM; approved service accounts and credentials | IT/security validation: **Pending** |
| Software repository access | Internal Git repository; npm registry/package mirror or approved controlled internet access | IT availability / procurement: **Pending** |
| Backup and monitoring | Scheduled backup and rollback; storage allocation; basic server/application monitoring | IT availability / procurement: **Pending** |
| AI / predictive copilot | Approved GPT-5-class reasoning-model access through Microsoft Foundry / Azure OpenAI; secure endpoint and credentials; approval to process internal engineering context; inference/token budget | Model access, approvals, and budget: **Pending** |
| Cloud services | No AWS/Azure infrastructure subscription is included in the proposed initial internal deployment; confirm whether any cloud or model-service subscription is needed | Architecture / subscription decision: **Pending** |

**Decision requested**

IT and Procurement to confirm the internal-versus-procured split, validate storage sizing, and provide an indicative budget. **No budget amount or resource availability is confirmed yet.**    

*Presenter note: The VM, storage, and access details are planning requirements from the current draft slide, not approved allocations or a final bill of materials.*

---

## New slide — Engineering AI: Offering, Value, and Market

**Subtitle**

*Enterprise Orchestration AI-enabled Platform — working title*

### What is our unique offering?

Bring engineering context together across PLM, ERP, requirements/ALM, and product-configuration systems, so an AI assistant can provide answers grounded in relevant source evidence. The longer-term vision is to prepare changes—such as a new requirement or change-notice update—for human approval and controlled write-back.

**Our differentiation to validate:** the combination of engineering-lifecycle context, evidence-grounded answers, and a governed path from answer to approved action—not AI or write-back alone.

### What value do we bring to customers?

- Spend less time searching across systems and copying information between them.
- Get answers with source evidence and the surrounding engineering context.
- Create a path from investigation to reviewed action while keeping source   applications authoritative.

    *These are intended benefits to validate with customer workflows; write-back is a future capability, not a current availability claim.*

### Are there competing or existing tools?

**Yes.** Microsoft Copilot Studio, Palantir AIP / Foundry Ontology, Atlassian Rovo, IBM watsonx Orchestrate, and PTC Windchill+ offer overlapping capabilities in enterprise knowledge, assistants, orchestration, governed actions, or PLM.

*This is an adjacent-market view, not a feature-by-feature comparison. The opportunity to differentiate is the engineering-specific combination above; validate it against customer needs and incumbent tools. Any future write-back would require human approval, permissions, and audit controls.*

### Source notes

- Microsoft, [Copilot Studio knowledge sources](https://learn.microsoft.com/en-us/microsoft-copilot-studio/knowledge-copilot-studio) and [Microsoft 365 Copilot connectors overview](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/overview).
- Palantir, [AIP overview](https://www.palantir.com/docs/foundry/aip/overview/) and [Ontology overview, including action types and functions](https://www.palantir.com/docs/foundry/ontology/overview/).
- Atlassian, [What is Rovo?](https://support.atlassian.com/rovo/docs/what-is-rovo/) (including agents that can create or edit Jira work items and Confluence pages with permission).
- IBM, [watsonx Orchestrate](https://www.ibm.com/products/watsonx-orchestrate).
- PTC, [Windchill+](https://www.ptc.com/en/products/windchill-plus).

*Market note: These official product sources demonstrate adjacent capabilities in enterprise knowledge, assistants, orchestration, governed actions, or PLM. They do not prove that competitors cannot support this use case, nor that this platform is uniquely capable. Validate product availability, workflow fit, and differentiation before making external claims.*
