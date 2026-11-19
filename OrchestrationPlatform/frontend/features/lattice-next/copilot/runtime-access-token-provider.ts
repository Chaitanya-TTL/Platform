import "server-only";

export type RuntimeAccessTokenResult =
  | { status: "available"; accessToken: string }
  | { status: "unavailable" }
  | { status: "failed" };

export interface RuntimeAccessTokenProvider {
  isConfigured(): boolean;
  getAccessToken(signal?: AbortSignal): Promise<RuntimeAccessTokenResult>;
}

export class UnconfiguredRuntimeAccessTokenProvider implements RuntimeAccessTokenProvider {
  isConfigured(): boolean {
    return false;
  }

  async getAccessToken(): Promise<RuntimeAccessTokenResult> {
    return { status: "unavailable" };
  }
}

export const runtimeAccessTokenProvider: RuntimeAccessTokenProvider =
  new UnconfiguredRuntimeAccessTokenProvider();
