/**
 * The accessibility contact (רכז/ת נגישות) published on /accessibility, as Israeli regulation 35
 * requires. Set per deployment in the environment (`.env.example`); empty until the owner names
 * someone, and the page then says the details are being published instead of inventing them.
 */
export type A11yContact = { name: string; email: string; phone: string };

export function a11yContact(
  env: Record<string, string | undefined> = process.env,
): A11yContact | null {
  const contact = {
    name: env.A11Y_CONTACT_NAME?.trim() ?? "",
    email: env.A11Y_CONTACT_EMAIL?.trim() ?? "",
    phone: env.A11Y_CONTACT_PHONE?.trim() ?? "",
  };
  return contact.email || contact.phone ? contact : null;
}

/** Date of the last review of the statement; update it whenever the statement changes. */
export const STATEMENT_UPDATED = "2026-10-25";
