# Windchill Requirements Platform Integration

This tranche adds backend-owned extraction of latest Windchill parts, engineering attributes, linked requirements specifications, child requirement documents, primary content metadata, attachments, and protected file streaming.

## Runtime configuration

Use secure configuration or environment variables. Do not commit credentials.

```text
WindchillRequirements__BaseUrl=http://windchill-host
WindchillRequirements__Username=<service account>
WindchillRequirements__Password=<secret>
WindchillRequirements__TimeoutSeconds=90
```

## Platform endpoints

- `GET /api/engineering/windchill/requirements?partName=<name>`
- `GET /api/engineering/windchill/requirements?partNumber=<number>`
- `GET /api/engineering/windchill/requirements?partOid=<validated oid>`
- `GET /api/engineering/windchill/content/primary?documentId=<document oid>`
- `GET /api/engineering/windchill/content/attachment?documentId=<document oid>&contentId=<content oid>`

The response labels the validated POC attributes and requirement documents as `poc-synthetic`. The confirmed relationship semantics are `Described By` and document containment. The integration does not claim native Satisfy or Allocate links.

Authenticated Windchill URLs remain backend-only. Attachment URLs are resolved from trusted Windchill metadata, checked against the configured Windchill host, and never accepted from browser input.
