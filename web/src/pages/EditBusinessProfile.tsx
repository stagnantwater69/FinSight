import { useNavigate, useParams } from "react-router-dom";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { BusinessProfileForm } from "../components/BusinessProfileForm";
import { getErrorMessage } from "../lib/errors";
import type { BusinessProfileInput } from "../lib/types";
import { FormPage } from "../components/ui";

export function EditBusinessProfile() {
  const { id } = useParams<{ id: string }>();
  const { profiles, updateProfile } = useBusinessProfiles();
  const navigate = useNavigate();

  const profile = profiles.find((p) => p.id === Number(id));

  if (!profile) {
    return <p className="text-sm text-ink-500">Business profile not found.</p>;
  }

  async function handleSubmit(input: BusinessProfileInput) {
    try {
      await updateProfile(profile!.id, input);
      navigate("/business-profiles");
    } catch (err) {
      throw new Error(getErrorMessage(err));
    }
  }

  return (
    <FormPage eyebrow="Management" title={`Edit ${profile.name}`} wide>
      <BusinessProfileForm
        submitLabel="Save changes"
        initialValues={{
          name: profile.name,
          type: profile.type,
          availableFunds: profile.availableFunds,
          expectedMonthlyExpenses: profile.expectedMonthlyExpenses,
          operatingDays: profile.operatingDays,
          largeExpenseThresholdPercent: profile.largeExpenseThresholdPercent,
        }}
        onSubmit={handleSubmit}
      />
    </FormPage>
  );
}
