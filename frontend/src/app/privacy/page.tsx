import type { Metadata } from 'next'
import Link from 'next/link'
import BrandMark from '@/components/BrandMark'

export const metadata: Metadata = {
  title: 'Privacy Policy | AqualityBill',
  description: 'How the AqualityBill app collects and uses residents’ information.',
}

// Public page (no login). Linked from the Google sign-in consent screen.
export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-10">
      <article className="mx-auto max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-10 shadow-sm text-slate-700 dark:text-slate-300 text-sm leading-relaxed space-y-5">
        <header className="flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Privacy Policy</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">AqualityBill · Last updated November 12, 2026</p>
          </div>
        </header>

        <p>
          AqualityBill is the water billing system of the Aquality Cooperative for residents of Barangay
          Metolza. This page explains what information the AqualityBill app and website collect, why, and
          how it is protected.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Information we collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>From Google sign-in:</strong> your name, Gmail address, and profile picture. We never
              see or store your Google password.
            </li>
            <li>
              <strong>Details you enter:</strong> your water meter number, name, mobile number, address,
              gender, and date of birth, used to match your account to your water service record.
            </li>
            <li>
              <strong>Service records:</strong> meter readings, bills, and payment status, plus any leak
              reports (including photos) and installation requests you send.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">How we use it</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To confirm you are the account holder for your water meter.</li>
            <li>To show your bills, payment status, and service notices in the app.</li>
            <li>To send you bill reminders, due date and disconnection notices, and report updates.</li>
            <li>To respond to leak reports and installation requests.</li>
          </ul>
          <p>
            We do not sell your information or use it for advertising. It is only seen by authorized
            cooperative staff for billing and water service.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">How it is stored</h2>
          <p>
            Your information is stored in a secured database (Supabase) and sent only over encrypted
            connections. Each resident can only see their own records in the app.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Your choices</h2>
          <p>
            You can ask us to correct your information, or to delete your app account, by contacting us
            below or visiting the barangay water office. Billing records may need to be kept for the
            cooperative’s accounting even after an app account is deleted.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Contact</h2>
          <p>
            Email{' '}
            <a href="mailto:aqualitybill@gmail.com" className="text-primary-600 dark:text-primary-400 underline">
              aqualitybill@gmail.com
            </a>{' '}
            or visit the Barangay Metolza water office.
          </p>
        </section>

        <footer className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <Link href="/download" className="text-primary-600 dark:text-primary-400 underline">
            Download the AqualityBill app
          </Link>
        </footer>
      </article>
    </div>
  )
}
