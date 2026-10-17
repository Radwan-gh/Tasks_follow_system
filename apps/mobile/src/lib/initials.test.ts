import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first letter of the first and last name", () => {
    expect(initials({ displayName: "أحمد سالم", firstName: "أحمد", lastName: "سالم" })).toBe("أ.س");
  });

  it("keeps a compound first name as one name", () => {
    expect(initials({ displayName: "عبد الله محمد", firstName: "عبد الله", lastName: "محمد" })).toBe("ع.م");
  });

  it("skips the definite article on the family name", () => {
    expect(initials({ displayName: "سارة العتيبي", firstName: "سارة", lastName: "العتيبي" })).toBe("س.ع");
  });

  it("falls back to the first and last word of displayName", () => {
    expect(initials({ displayName: "Member Two" })).toBe("M.T");
    expect(initials({ displayName: "عبد الله محمد" })).toBe("ع.م");
  });

  it("handles a one-word or empty name", () => {
    expect(initials({ displayName: "Admin", firstName: "Admin", lastName: "" })).toBe("A");
    expect(initials({ displayName: "" })).toBe("؟");
  });
});
