export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBadgeStation } = await import("./lib/badge/station");
    await startBadgeStation();
  }
}
