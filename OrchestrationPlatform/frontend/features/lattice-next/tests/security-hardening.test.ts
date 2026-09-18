import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = (path: string) => resolve(process.cwd(), "../..", path);

describe("AUD-001 secret containment", () => {
  it("loads the ignored root .env automatically and contains no embedded key", () => {
    const script = readFileSync(root("configit_extractor/api call.ps1"), "utf8");
    expect(script).not.toMatch(/Authorization\s*=\s*["']ApiKey\s+[A-Za-z0-9_\-=]{20,}/);
    expect(script).toContain('Join-Path $platformRoot ".env"');
    expect(script).toContain("Import-RootDotEnv");
    expect(script).toContain("CONFIGIT_API_KEY");
    expect(script).toContain("CONFIGIT_PRODUCT_ID");
  });

  it("ships a blank commit-safe .env.example rather than a usable credential", () => {
    const example = readFileSync(root(".env.example"), "utf8");
    expect(example).toMatch(/^CONFIGIT_API_KEY=\s*$/m);
    expect(example).toMatch(/^CONFIGIT_PRODUCT_ID=\s*$/m);
    expect(example).not.toMatch(/^CONFIGIT_API_KEY=.{12,}$/m);
  });

  it("ignores local environment files while allowing safe examples", () => {
    const ignore = readFileSync(root(".gitignore"), "utf8");
    expect(ignore).toMatch(/^\.env$/m);
    expect(ignore).toMatch(/^\.env\.\*$/m);
    expect(ignore).toMatch(/^!\.env\.example$/m);
    expect(ignore).toMatch(/^!\*\*\/\.env\.example$/m);
  });
});
