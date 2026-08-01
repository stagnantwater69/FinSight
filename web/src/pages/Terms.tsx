import { PublicLayout, PublicPageHead } from "../components/PublicLayout";

/**
 * Terms — honest usage terms, not generated legal boilerplate.
 *
 * Same reasoning as the privacy page: a document that mimics reviewed legal
 * text would be asserting a position nobody has actually taken. What is here
 * instead is the set of things a user genuinely needs to know before relying
 * on this software — chiefly that it is a monitoring tool and not an
 * accounting record of authority, which is the one misunderstanding that could
 * actually cost someone money.
 */
export function Terms() {
  return (
    <PublicLayout>
      <PublicPageHead
        eyebrow="Others"
        title="Terms of Use"
        lede="What FinSight is for, what it is not for, and what you can expect from it."
      />

      <div className="mx-auto max-w-3xl px-4 py-12 lg:px-6 lg:py-16">
        <div className="space-y-8 text-sm leading-relaxed text-ink-600">
          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">What FinSight is</h2>
            <p className="mt-2">
              A financial monitoring tool. It records what you enter, organises it, and shows you what
              your own figures say. It is free to use while in active development.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">What it is not</h2>
            <p className="mt-2">
              It is not an accounting system of record, and it does not produce official financial
              statements or file anything with any authority. It does not give financial advice — it
              shows you what the numbers say and leaves the decision with you. For anything official,
              use a qualified accountant.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">Accuracy, and your part in it</h2>
            <p className="mt-2">
              Figures read from a receipt photograph are a reading, not a fact. FinSight shows you
              everything it read and saves nothing until you confirm it, and it marks the values it is
              unsure about. Checking those before confirming is your responsibility, and the accuracy of
              your records depends on it.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">Your account</h2>
            <p className="mt-2">
              Keep your password to yourself — anyone who has it can reach your records. Use FinSight
              for your own business records, and not to store anything unlawful.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">Availability</h2>
            <p className="mt-2">
              This is software under active development. Features change, and the service can be
              unavailable at times. Keep your own copy of anything you cannot afford to lose.
            </p>
          </section>

          <div className="rounded-2xl border border-edge-brand bg-tint-brand/40 p-5">
            <p className="text-ink-700">
              <strong className="font-semibold">A note on what this document is.</strong> This is a
              plain-language statement of how FinSight is meant to be used, written for a system in
              development. It is not lawyer-reviewed terms of service, and it will be replaced by
              reviewed terms before FinSight is offered commercially.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
