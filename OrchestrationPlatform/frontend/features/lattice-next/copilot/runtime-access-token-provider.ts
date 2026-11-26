import "server-only";

export type RuntimeAccessTokenResult =
  | { status: "available"; accessToken: string }
  | { status: "unavailable" }
  | { status: "failed" };

export interface RuntimeAccessTokenProvider {
  isConfigured(): boolean;
  getAccessToken(signal?: AbortSignal): Promise<RuntimeAccessTokenResult>;
}

const LOCAL_DEVELOPMENT_TOKEN = "lattice-local-development";

export class UnconfiguredRuntimeAccessTokenProvider implements RuntimeAccessTokenProvider {
  isConfigured(): boolean {
    return false;
  }

  async getAccessToken(): Promise<RuntimeAccessTokenResult> {
    return { status: "unavailable" };
  }
}

export class LocalDevelopmentRuntimeAccessTokenProvider implements RuntimeAccessTokenProvider {
  isConfigured(): boolean {
    return process.env.NODE_ENV === "development";
  }

  async getAccessToken(): Promise<RuntimeAccessTokenResult> {
    return this.isConfigured()
      ? { status: "available", accessToken: LOCAL_DEVELOPMENT_TOKEN }
      : { status: "unavailable" };
  }
}

export const runtimeAccessTokenProvider: RuntimeAccessTokenProvider =
  new LocalDevelopmentRuntimeAccessTokenProvider();
