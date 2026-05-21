import { getConnectedAccount, getDb } from "@nitsyclaw/shared/db";
import {
  getProviderSetupReadiness,
  summarizeProviderSetupReadiness,
  type ProviderReadinessSummary,
  type ProviderSetupReadiness,
} from "./provider-setup-readiness";
import { getOwnerIdentity } from "./dashboard-runtime";

export interface DashboardProviderHealth {
  checkedAt: string;
  readiness: ProviderSetupReadiness[];
  summary: ProviderReadinessSummary;
}

export async function loadDashboardProviderHealth(env: Record<string, string | undefined> = process.env): Promise<DashboardProviderHealth> {
  let spotifyConnected = false;
  let spotifyExpiresAt: Date | null = null;
  let spotifyHasRefreshToken = false;

  try {
    const spotifyConfigured = Boolean(
      env.SPOTIFY_CLIENT_ID &&
        env.SPOTIFY_CLIENT_SECRET &&
        env.SPOTIFY_REDIRECT_URI,
    );
    if (spotifyConfigured) {
      const db = getDb();
      const { ownerHash } = getOwnerIdentity();
      const spotifyAccount = await getConnectedAccount(db, {
        provider: "spotify",
        ownerHash,
      });
      spotifyConnected = Boolean(spotifyAccount);
      spotifyExpiresAt = spotifyAccount?.expiresAt ?? null;
      spotifyHasRefreshToken = Boolean(spotifyAccount?.refreshToken);
    }
  } catch {
    spotifyConnected = false;
    spotifyExpiresAt = null;
    spotifyHasRefreshToken = false;
  }

  const readiness = getProviderSetupReadiness(env, {
    spotifyConnected,
    spotifyExpiresAt,
    spotifyHasRefreshToken,
  });

  return {
    checkedAt: new Date().toISOString(),
    readiness,
    summary: summarizeProviderSetupReadiness(readiness),
  };
}
