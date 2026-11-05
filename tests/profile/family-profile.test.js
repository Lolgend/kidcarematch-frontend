import { describe, expect, it, vi } from "vitest";
import {
  PROFILE_DEFAULTS,
  RANK_WEIGHTS,
  WEIGHT_KEYS,
  WEIGHT_LABELS,
  fromApiProfile,
  isProfileComplete,
  nextMonthValue,
  normalizeWeights,
  priorityOrder,
  setRank,
  toApiProfile,
  validateFamilyProfile,
  weightsFromCostShare,
  weightsFromOrder,
} from "../../src/profile/familyProfile.js";

describe("familyProfile module", () => {
  const buildValidForm = (overrides = {}) => ({
    ...PROFILE_DEFAULTS,
    home: "123456",
    enrolMonth: "2026-12",
    ...overrides,
  });

  describe("validateFamilyProfile and isProfileComplete", () => {
    it("accepts a valid defaulted form with 6-digit home postcode and valid enrolment month", () => {
      const form = buildValidForm();
      const errors = validateFamilyProfile(form);
      expect(errors).toEqual([]);
      expect(isProfileComplete(form)).toBe(true);
    });

    it("rejects missing or malformed home postal codes", () => {
      expect(validateFamilyProfile(buildValidForm({ home: "" }))).toContain(
        "Enter your 6-digit home postal code."
      );
      expect(validateFamilyProfile(buildValidForm({ home: "12345" }))).toContain(
        "Enter your 6-digit home postal code."
      );
      expect(validateFamilyProfile(buildValidForm({ home: "1234567" }))).toContain(
        "Enter your 6-digit home postal code."
      );
      expect(validateFamilyProfile(buildValidForm({ home: "abcdef" }))).toContain(
        "Enter your 6-digit home postal code."
      );
    });

    it("rejects missing required child level, citizenship status, or care service", () => {
      expect(validateFamilyProfile(buildValidForm({ level: "" }))).toContain(
        "Select a child level."
      );
      expect(validateFamilyProfile(buildValidForm({ citizenship: "" }))).toContain(
        "Select citizenship status."
      );
      expect(validateFamilyProfile(buildValidForm({ service: "" }))).toContain(
        "Select care service required."
      );
    });

    it("rejects missing or malformed enrolment months", () => {
      expect(validateFamilyProfile(buildValidForm({ enrolMonth: "" }))).toContain(
        "Enter enrolment month in YYYY-MM format."
      );
      expect(validateFamilyProfile(buildValidForm({ enrolMonth: "2026-1" }))).toContain(
        "Enter enrolment month in YYYY-MM format."
      );
      expect(validateFamilyProfile(buildValidForm({ enrolMonth: "2026/12" }))).toContain(
        "Enter enrolment month in YYYY-MM format."
      );
      expect(validateFamilyProfile(buildValidForm({ enrolMonth: "invalid" }))).toContain(
        "Enter enrolment month in YYYY-MM format."
      );
    });

    it("rejects non-positive budgets", () => {
      expect(validateFamilyProfile(buildValidForm({ budget: 0 }))).toContain(
        "Enter a monthly budget."
      );
      expect(validateFamilyProfile(buildValidForm({ budget: -50 }))).toContain(
        "Enter a monthly budget."
      );
      expect(validateFamilyProfile(buildValidForm({ budget: "" }))).toContain(
        "Enter a monthly budget."
      );
      expect(validateFamilyProfile(buildValidForm({ budget: "abc" }))).toContain(
        "Enter a monthly budget."
      );
    });

    it("treats workplace as optional when location preference is HOME", () => {
      const form = buildValidForm({ locationPref: "HOME", work: "" });
      expect(validateFamilyProfile(form)).toEqual([]);
      expect(isProfileComplete(form)).toBe(true);
    });

    it("rejects malformed workplace postal code when provided under HOME preference", () => {
      const form = buildValidForm({ locationPref: "HOME", work: "12345" });
      expect(validateFamilyProfile(form)).toContain(
        "Workplace postal code must be 6 digits."
      );
      expect(isProfileComplete(form)).toBe(false);
    });

    it("requires a 6-digit workplace postal code when location preference is WORKPLACE or EITHER", () => {
      const workplaceMissing = buildValidForm({ locationPref: "WORKPLACE", work: "" });
      expect(validateFamilyProfile(workplaceMissing)).toContain(
        "Add your workplace postal code for this location preference."
      );
      expect(isProfileComplete(workplaceMissing)).toBe(false);

      const eitherMissing = buildValidForm({ locationPref: "EITHER", work: "" });
      expect(validateFamilyProfile(eitherMissing)).toContain(
        "Add your workplace postal code for this location preference."
      );
      expect(isProfileComplete(eitherMissing)).toBe(false);

      const workplaceMalformed = buildValidForm({ locationPref: "WORKPLACE", work: "123" });
      expect(validateFamilyProfile(workplaceMalformed)).toContain(
        "Workplace postal code must be 6 digits."
      );

      const workplaceValid = buildValidForm({ locationPref: "WORKPLACE", work: "654321" });
      expect(validateFamilyProfile(workplaceValid)).toEqual([]);
      expect(isProfileComplete(workplaceValid)).toBe(true);

      const eitherValid = buildValidForm({ locationPref: "EITHER", work: "654321" });
      expect(validateFamilyProfile(eitherValid)).toEqual([]);
      expect(isProfileComplete(eitherValid)).toBe(true);
    });

    it("treats income and members as optional without failing validation", () => {
      const form = buildValidForm({ income: "", members: "" });
      expect(validateFamilyProfile(form)).toEqual([]);
      expect(isProfileComplete(form)).toBe(true);
    });

    it("returns false for isProfileComplete whenever errors exist", () => {
      expect(isProfileComplete(null)).toBe(false);
      expect(isProfileComplete({})).toBe(false);
      expect(isProfileComplete(buildValidForm({ home: "" }))).toBe(false);
    });

    it("does not call OneMap or perform any external network requests", () => {
      const globalFetchSpy = vi.fn();
      vi.stubGlobal("fetch", globalFetchSpy);
      try {
        validateFamilyProfile(buildValidForm());
        expect(globalFetchSpy).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe("toApiProfile", () => {
    it("serialises weights { vacancy: 50, cost: 35, travel: 15 } to weights summing to 1.0", () => {
      const form = buildValidForm({
        weights: { vacancy: 50, cost: 35, travel: 15 },
      });
      const apiPayload = toApiProfile(form);
      expect(apiPayload.vacancy_weight).toBe(0.5);
      expect(apiPayload.cost_weight).toBe(0.35);
      expect(apiPayload.travel_weight).toBe(0.15);
      expect(
        apiPayload.vacancy_weight + apiPayload.cost_weight + apiPayload.travel_weight
      ).toBeCloseTo(1.0, 5);
    });

    it("serialises different weight rankings to 3 weights summing to 1.0", () => {
      const form = buildValidForm({
        weights: { vacancy: 15, cost: 50, travel: 35 },
      });
      const apiPayload = toApiProfile(form);
      expect(apiPayload.vacancy_weight).toBe(0.15);
      expect(apiPayload.cost_weight).toBe(0.5);
      expect(apiPayload.travel_weight).toBe(0.35);
      expect(
        apiPayload.vacancy_weight + apiPayload.cost_weight + apiPayload.travel_weight
      ).toBeCloseTo(1.0, 5);
    });

    it("preserves an explicitly passed profileName or form profile_name", () => {
      const form = buildValidForm({ profile_name: "Form Profile Name" });
      const apiPayloadDefault = toApiProfile(form);
      expect(apiPayloadDefault.profile_name).toBe("Form Profile Name");

      const apiPayloadExplicit = toApiProfile(form, "Custom Preserved Name");
      expect(apiPayloadExplicit.profile_name).toBe("Custom Preserved Name");
    });

    it("defaults profile_name to 'My family profile' when no name is provided", () => {
      const form = buildValidForm();
      delete form.profile_name;
      delete form.profileName;
      const apiPayload = toApiProfile(form);
      expect(apiPayload.profile_name).toBe("My family profile");
    });

    it("maps blank optional income to 0 and blank optional members to 1", () => {
      const form = buildValidForm({ income: "", members: "" });
      const apiPayload = toApiProfile(form);
      expect(apiPayload.household_income).toBe(0);
      expect(apiPayload.household_member_count).toBe(1);
    });

    it("maps workplace postal code to null when empty, and retains it when set", () => {
      const formNoWork = buildValidForm({ work: "" });
      expect(toApiProfile(formNoWork).workplace_postal_code).toBeNull();

      const formWithWork = buildValidForm({ work: "654321" });
      expect(toApiProfile(formWithWork).workplace_postal_code).toBe("654321");
    });

    it("maps backend schema field names correctly", () => {
      const form = buildValidForm({
        level: "k1",
        citizenship: "SPR",
        service: "Half Day",
        home: "654321",
        locationPref: "WORKPLACE",
        work: "112233",
        income: "8500",
        members: "4",
        budget: "1500",
        enrolMonth: "2027-01",
      });
      const apiPayload = toApiProfile(form);
      expect(apiPayload).toMatchObject({
        level: "k1",
        citizenship_status: "SPR",
        service_required: "Half Day",
        home_postal_code: "654321",
        workplace_postal_code: "112233",
        location_preference: "WORKPLACE",
        household_income: 8500,
        household_member_count: 4,
        budget_max: 1500,
        enrollment_month_year: "2027-01",
      });
    });
  });

  describe("fromApiProfile", () => {
    const apiProfile = {
      profile_id: "profile-100",
      profile_name: "Loaded Family Profile",
      level: "pg",
      citizenship_status: "OTHERS",
      service_required: "Full Day",
      home_postal_code: "560123",
      workplace_postal_code: "018989",
      location_preference: "EITHER",
      household_income: 6000,
      household_member_count: 3,
      budget_max: 1200,
      enrollment_month_year: "2027-06",
      vacancy_weight: 0.35,
      cost_weight: 0.5,
      travel_weight: 0.15,
    };

    it("reconstructs frontend form object matching PROFILE_DEFAULTS structure and preserves profile identifiers", () => {
      const reconstructed = fromApiProfile(apiProfile);
      expect(reconstructed.profile_id).toBe("profile-100");
      expect(reconstructed.profile_name).toBe("Loaded Family Profile");
      expect(reconstructed.level).toBe("pg");
      expect(reconstructed.citizenship).toBe("OTHERS");
      expect(reconstructed.service).toBe("Full Day");
      expect(reconstructed.home).toBe("560123");
      expect(reconstructed.work).toBe("018989");
      expect(reconstructed.locationPref).toBe("EITHER");
      expect(reconstructed.income).toBe("6000");
      expect(reconstructed.members).toBe("3");
      expect(reconstructed.budget).toBe(1200);
      expect(reconstructed.enrolMonth).toBe("2027-06");
    });

    it("round-trips backend weights when no local draft exists", () => {
      const reconstructed = fromApiProfile(apiProfile);
      expect(reconstructed.weights).toEqual({
        vacancy: 35,
        cost: 50,
        travel: 15,
      });
    });

    it("preserves weights from local draft when provided", () => {
      const localDraft = {
        weights: { vacancy: 15, cost: 35, travel: 50 },
      };
      const reconstructed = fromApiProfile(apiProfile, localDraft);
      expect(reconstructed.weights).toEqual({
        vacancy: 15,
        cost: 35,
        travel: 50,
      });
    });

    it("handles legacy 2-weight API profiles lacking vacancy_weight", () => {
      const legacyApi = {
        ...apiProfile,
        vacancy_weight: undefined,
        cost_weight: 0.7,
        travel_weight: 0.3,
      };
      const reconstructed = fromApiProfile(legacyApi);
      expect(reconstructed.weights).toEqual({
        vacancy: 50,
        cost: 35,
        travel: 15,
      });
    });

    it("maps null workplace postal code and zero income to empty strings", () => {
      const minimalApi = {
        ...apiProfile,
        workplace_postal_code: null,
        household_income: 0,
        household_member_count: 1,
      };
      const reconstructed = fromApiProfile(minimalApi);
      expect(reconstructed.work).toBe("");
      expect(reconstructed.income).toBe("");
      expect(reconstructed.members).toBe("1");
    });
  });

  describe("shared ranking and default helpers", () => {
    it("exports standard weight keys, labels, and rank weights", () => {
      expect(WEIGHT_KEYS).toEqual(["vacancy", "cost", "travel"]);
      expect(WEIGHT_LABELS).toEqual({
        vacancy: "Vacancy fit",
        cost: "Cost fit",
        travel: "Travel fit",
      });
      expect(RANK_WEIGHTS).toEqual([50, 35, 15]);
    });

    it("determines priority order with ties resolving by default key order", () => {
      expect(priorityOrder({ vacancy: 50, cost: 35, travel: 15 })).toEqual([
        "vacancy",
        "cost",
        "travel",
      ]);
      expect(priorityOrder({ vacancy: 30, cost: 30, travel: 30 })).toEqual([
        "vacancy",
        "cost",
        "travel",
      ]);
      expect(priorityOrder({ vacancy: 10, cost: 50, travel: 20 })).toEqual([
        "cost",
        "travel",
        "vacancy",
      ]);
    });

    it("normalizes arbitrary weights to standard preset ranks", () => {
      expect(normalizeWeights({ vacancy: 80, cost: 10, travel: 10 })).toEqual({
        vacancy: 50,
        cost: 35,
        travel: 15,
      });
    });

    it("swaps ranks using setRank", () => {
      const base = { vacancy: 50, cost: 35, travel: 15 };
      // Move 'travel' (currently rank 2) to rank 0
      const updated = setRank(base, "travel", 0);
      expect(updated).toEqual({
        travel: 50,
        cost: 35,
        vacancy: 15,
      });
    });

    it("derives weights from cost share", () => {
      expect(weightsFromCostShare(0.7)).toEqual({
        vacancy: 50,
        cost: 35,
        travel: 15,
      });
    });

    it("computes nextMonthValue in YYYY-MM format", () => {
      const nextMonth = nextMonthValue();
      expect(nextMonth).toMatch(/^\d{4}-\d{2}$/);
    });
  });
});
