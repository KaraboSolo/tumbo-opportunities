import { PageTitle } from "../components/ui";

// Placeholder wording for the prototype. Have it reviewed for POPIA compliance before launch.
export function Privacy() {
  return (
    <article className="space-y-4 text-ink-soft">
      <PageTitle title="Privacy policy" subtitle="Draft for the prototype. Final wording to follow." />
      <section>
        <h2 className="font-semibold text-ink">What we collect</h2>
        <p>Your name, login email, contact email, optional WhatsApp number, your CV, and the job preferences you set.</p>
      </section>
      <section>
        <h2 className="font-semibold text-ink">Why</h2>
        <p>
          Only to match you with jobs and tell you about new ones. We use an AI service (Google Gemini) to read your CV
          and compare it with job listings. We do not send your contact details to it, and we do not use personal
          attributes such as age, gender or race.
        </p>
      </section>
      <section>
        <h2 className="font-semibold text-ink">Who sees it</h2>
        <p>
          Nobody else. We don't share your CV with employers. When you open a job, you go to the listing on Adzuna and
          apply there yourself.
        </p>
      </section>
      <section>
        <h2 className="font-semibold text-ink">Your rights</h2>
        <p>
          You can update your details, pause notifications, or delete your account and all your data at any time in
          Settings. Every email has a link to pause emails.
        </p>
      </section>
    </article>
  );
}
