// Pure, framework-free crew-mobile helpers. Unit-tested via node --test
// (crewLogic.test.mjs). Kept in plain JS so the exact runtime code is tested.

// The crew read RPCs raise this when the signed-in user is authenticated but is
// not an active crew member (e.g. a customer or office-staff account).
const NOT_CREW = "Not authorized as crew";

function rawMessage(err) {
  return err && typeof err === "object" && "message" in err
    ? String(err.message ?? "")
    : String(err ?? "");
}

export function isNotCrewError(err) {
  return rawMessage(err).includes(NOT_CREW);
}

// Never leak raw Supabase/DB internals to the crew UI.
export function crewErrorMessage(err) {
  const raw = rawMessage(err);
  if (raw.includes(NOT_CREW)) return "You don't have crew access to this app.";
  if (raw.includes("Job not found")) return "This job isn't assigned to you.";
  return "Something went wrong. Please try again.";
}

export function crewRoleLabel(role) {
  switch (String(role ?? "").toLowerCase()) {
    case "crew_lead":
      return "Crew Lead";
    case "mover":
      return "Mover";
    case "":
      return "";
    default:
      return String(role)
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
