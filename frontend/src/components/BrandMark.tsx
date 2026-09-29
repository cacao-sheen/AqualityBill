// Shared water-drop brand mark — used on the login screen and the sidebar so
// the logo is identical everywhere, and drawn in the same silhouette as the
// PDF letterhead's badge (see drawLetterheadHeader in lib/pdfReport.ts) for
// consistency between the web app and generated documents.
export default function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <div
      className={`${className} shrink-0 rounded-xl bg-gradient-to-br from-primary-400 to-primary-700 flex items-center justify-center shadow-md shadow-primary-900/20`}
    >
      <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="none">
        <path
          d="M12 2.3C12 2.3 5.2 11.2 5.2 15.4A6.8 6.8 0 0 0 12 22.2a6.8 6.8 0 0 0 6.8-6.8C18.8 11.2 12 2.3 12 2.3Z"
          fill="white"
        />
        <ellipse
          cx="9.6"
          cy="13.4"
          rx="1.15"
          ry="1.75"
          fill="white"
          fillOpacity="0.5"
          transform="rotate(-25 9.6 13.4)"
        />
      </svg>
    </div>
  )
}
