import { a11yContact } from "./contact";

describe("accessibility contact", () => {
  it("is missing until an email or phone is configured", () => {
    expect(a11yContact({})).toBeNull();
    expect(a11yContact({ A11Y_CONTACT_NAME: "Noa" })).toBeNull();
  });

  it("is published with whatever is configured, trimmed", () => {
    expect(a11yContact({ A11Y_CONTACT_EMAIL: " a11y@example.com " })).toEqual({
      name: "",
      email: "a11y@example.com",
      phone: "",
    });
  });
});
