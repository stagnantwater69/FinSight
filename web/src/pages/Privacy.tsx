import { PublicLayout, PublicPageHead } from "../components/PublicLayout";

/**
 * Privacy — a plain description of what the system actually does with data.
 *
 * WHAT THIS IS NOT: lawyer-drafted boilerplate. Generating a document that
 * looks like a reviewed privacy policy, complete with confident claims about
 * regulatory compliance, would be inventing a legal position nobody holds. It
 * would also be the single most damaging thing on this site to be caught out
 * on, because it is the page a reader is most entitled to trust.
 *
 * So every statement below is one that can be checked against the code —
 * profile-scoped queries, a private storage bucket, ten-minute signed URLs,
 * the assistant's inputs — and the notice at the end says plainly what stage
 * this is at. Replace with a reviewed policy before taking real customers.
 */
export function Privacy() {
  return (
    <PublicLayout>
      <PublicPageHead
        eyebrow="Others"
        title="Privacy"
        lede="What FinSight stores, where it goes, and who can reach it — in plain language."
      />

      <div className="mx-auto max-w-3xl px-4 py-12 lg:px-6 lg:py-16">
        <div className="space-y-8 text-sm leading-relaxed text-ink-600">
          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">What we store</h2>
            <p className="mt-2">
              The account details you register with, the business profiles you create, and the records
              you enter — expenses, sales, categories, and any receipt images or spreadsheets you
              upload. Nothing is collected from you beyond what you enter or upload.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">Who can see it</h2>
            <p className="mt-2">
              Your records belong to your business profile, and every request to the server is checked
              against the profile it claims. One owner's records are not reachable from another owner's
              account. Receipt images are kept in private storage rather than at a public address;
              viewing one creates a temporary link that stops working after ten minutes.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">Where AI is involved</h2>
            <p className="mt-2">
              Two features send data to third-party AI providers: reading a receipt photograph, and
              answering a question you ask the assistant. Reading a receipt sends the image; asking a
              question sends figures drawn from your own records. The assistant is never given another
              business's data, and when your records do not contain an answer it says so rather than
              estimating one.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">How long it is kept</h2>
            <p className="mt-2">
              Records stay until you delete them. Be aware of a current limitation: deleting a record
              removes it from your books, but the receipt image or spreadsheet it came from is not yet
              removed from storage. Automatic cleanup of those files is not built yet, and we would
              rather say so than imply a deletion that does not happen.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">Getting your data out</h2>
            <p className="mt-2">
              Your records are yours. Contact us if you want a copy of them or want your account and its
              records removed.
            </p>
          </section>

          <div className="rounded-2xl border border-edge-brand bg-tint-brand/40 p-5">
            <p className="text-ink-700">
              <strong className="font-semibold">A note on what this document is.</strong> FinSight is in
              active development, and this is a plain-language description of how the system actually
              behaves — not a lawyer-reviewed privacy policy. It will be replaced by a reviewed one
              before FinSight is offered commercially.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
