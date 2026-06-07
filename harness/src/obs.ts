export async function checkObsHealth(serverUrl: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}
