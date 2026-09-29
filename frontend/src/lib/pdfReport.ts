import jsPDF from 'jspdf'
import autoTable, { type RowInput } from 'jspdf-autotable'

// Shared visual language for every generated PDF report/ticket in the app —
// keeps the letterhead, section styling, tables, and footer consistent
// instead of each page hand-rolling its own layout.

export const PDF_COLORS = {
  primary: [22, 119, 255] as [number, number, number],
  primaryTint: [230, 247, 255] as [number, number, number],
  textDark: [15, 23, 42] as [number, number, number],
  textMuted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  surfaceMuted: [248, 250, 252] as [number, number, number],
  statusPaid: [5, 150, 105] as [number, number, number],
  statusUnpaid: [245, 158, 11] as [number, number, number],
  statusOverdue: [220, 38, 38] as [number, number, number],
  statusPending: [217, 119, 6] as [number, number, number],
  statusOngoing: [37, 99, 235] as [number, number, number],
  statusResolved: [5, 150, 105] as [number, number, number],
}

/** Formats a number with thousands separators (e.g. 26246.63 -> "26,246.63"). Use for every peso amount and meter reading shown to a user. */
export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatGeneratedTimestamp() {
  return new Date().toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Starts a new report PDF with the shared branded letterhead (blue header bar,
 * title/subtitle, generated timestamp) and optional meta lines (reporting
 * period, coverage dates, etc.) beneath it. Returns the doc and the Y position
 * where body content should begin.
 */
export function createReportDocument(options: { title: string; subtitle?: string; meta?: string[] }) {
  const { title, subtitle, meta = [] } = options
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.width
  const headerHeight = subtitle ? 34 : 28

  doc.setFillColor(...PDF_COLORS.primary)
  doc.rect(0, 0, pageWidth, headerHeight, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(219, 234, 254)
  doc.text('AQUALITYBILL ADMIN', 14, 10)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Generated ${formatGeneratedTimestamp()}`, pageWidth - 14, 10, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(255, 255, 255)
  doc.text(title, 14, subtitle ? 22 : 20)

  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(219, 234, 254)
    doc.text(subtitle, 14, 29)
  }

  let cursorY = headerHeight + 10

  if (meta.length > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...PDF_COLORS.textMuted)
    meta.forEach((line) => {
      doc.text(line, 14, cursorY)
      cursorY += 5.5
    })
    cursorY += 3
  }

  return { doc, cursorY }
}

/**
 * Starts a new branded PDF with a navy letterhead — brand mark and a document
 * title on the left, up to a few label/value fields (bill no., period,
 * generated date, etc.) stacked on the right. Used for documents handed to or
 * representing something official for a consumer/utility audience (the bill
 * ticket, the billing/water-quality reports) — distinct from
 * createReportDocument's plain admin-blue header, still used for purely
 * internal summaries like the leak reports export.
 */
export function createLetterheadDocument(options: {
  documentTitle: string
  meta: Array<{ label: string; value: string }>
  utilityName?: string
}) {
  const { documentTitle, meta, utilityName = 'Barangay Montelza Water Services' } = options
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.width
  const headerHeight = 38
  const navy: [number, number, number] = [15, 23, 42]
  const lightBlue: [number, number, number] = [148, 197, 255]

  doc.setFillColor(...navy)
  doc.rect(0, 0, pageWidth, headerHeight, 'F')

  // Brand mark: a white water-drop silhouette on a blue rounded-square badge.
  // The triangle's base corners sit exactly on the circle (solved from the
  // circle equation), so the two shapes join with no visible seam.
  doc.setFillColor(...PDF_COLORS.primary)
  doc.roundedRect(14, 8, 10, 10, 2, 2, 'F')
  doc.setFillColor(255, 255, 255)
  doc.triangle(19, 9.3, 17.5, 12.2, 20.5, 12.2, 'F')
  doc.circle(19, 14.2, 2.5, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(255, 255, 255)
  doc.text('AqualityBill', 28, 15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...lightBlue)
  doc.text(utilityName, 28, 21)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(documentTitle, 28, 27)

  let metaY = 11
  meta.forEach(({ label, value }) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...lightBlue)
    doc.text(label.toUpperCase(), pageWidth - 14, metaY, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text(value, pageWidth - 14, metaY + 4.5, { align: 'right' })
    metaY += 10
  })

  return { doc, cursorY: headerHeight + 10 }
}

/** Bold, blue, uppercase section label with a hairline rule underneath. Returns the next writable Y. */
export function drawSectionLabel(doc: jsPDF, text: string, y: number, x = 14): number {
  const pageWidth = doc.internal.pageSize.width
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...PDF_COLORS.primary)
  doc.text(text.toUpperCase(), x, y)
  doc.setDrawColor(...PDF_COLORS.border)
  doc.setLineWidth(0.3)
  doc.line(x, y + 2.5, pageWidth - 14, y + 2.5)
  return y + 10
}

/** A rounded highlight card for the one headline number a report leads with (e.g. Total Amount Due). */
export function drawHighlightBox(
  doc: jsPDF,
  options: {
    x: number
    y: number
    width: number
    height?: number
    label: string
    value: string
    tint?: [number, number, number]
    color?: [number, number, number]
    labelFontSize?: number
    valueFontSize?: number
  }
): number {
  const {
    x, y, width, height = 22, label, value,
    tint = PDF_COLORS.primaryTint,
    color = PDF_COLORS.primary,
    labelFontSize = 8.5,
    valueFontSize = 16,
  } = options
  doc.setFillColor(...tint)
  doc.roundedRect(x, y, width, height, 3, 3, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(labelFontSize)
  doc.setTextColor(...PDF_COLORS.textMuted)
  doc.text(label.toUpperCase(), x + 7, y + 8)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(valueFontSize)
  doc.setTextColor(...color)
  doc.text(value, x + 7, y + (height - 5))

  return y + height
}

/** Bold label / normal value rows, reused across every summary PDF. Returns the next writable Y. */
export function drawKeyValueRows(
  doc: jsPDF,
  rows: Array<[string, string]>,
  startY: number,
  options: { x?: number; valueX?: number; lineHeight?: number } = {}
): number {
  const { x = 14, valueX = 75, lineHeight = 7 } = options
  let y = startY
  doc.setFontSize(10)
  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...PDF_COLORS.textDark)
    doc.text(label, x, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, valueX, y)
    y += lineHeight
  })
  return y
}

/** Small filled rounded-rect status chip (payment status, leak status, etc). Returns the chip width. */
export function drawStatusBadge(doc: jsPDF, text: string, x: number, y: number, color: [number, number, number]): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  const textWidth = doc.getTextWidth(text.toUpperCase())
  const paddingX = 4
  const boxWidth = textWidth + paddingX * 2

  doc.setFillColor(...color)
  doc.roundedRect(x, y - 4.5, boxWidth, 7, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.text(text.toUpperCase(), x + paddingX, y)

  return boxWidth
}

/** Consistent bordered/striped table (header bar in brand blue, zebra rows). Returns the Y just below the table. */
export function drawReportTable(
  doc: jsPDF,
  options: {
    startY: number
    head: RowInput[]
    body: RowInput[]
    foot?: RowInput[]
    columnStyles?: Record<string, Partial<{ halign: 'left' | 'center' | 'right'; cellWidth: number }>>
  }
): number {
  autoTable(doc, {
    startY: options.startY,
    head: options.head,
    body: options.body,
    foot: options.foot,
    theme: 'striped',
    margin: { left: 14, right: 14 },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: PDF_COLORS.textDark,
      lineColor: PDF_COLORS.border,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: PDF_COLORS.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    footStyles: {
      fillColor: PDF_COLORS.primaryTint,
      textColor: PDF_COLORS.primary,
      fontStyle: 'bold',
      fontSize: 10,
      lineColor: PDF_COLORS.border,
      lineWidth: 0.1,
    },
    alternateRowStyles: { fillColor: PDF_COLORS.surfaceMuted },
    columnStyles: options.columnStyles,
  })

  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? options.startY
}

/** Adds the shared footer (hairline rule, disclaimer, page number, brand mark) to every page. Call last, right before doc.save(). */
export function addReportFooter(doc: jsPDF, note = 'This report is system-generated for administrative review.') {
  const pageCount = doc.getNumberOfPages()
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height

  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i)

    doc.setDrawColor(...PDF_COLORS.border)
    doc.setLineWidth(0.2)
    doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16)

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(...PDF_COLORS.textMuted)
    doc.text(note, 14, pageHeight - 10)

    doc.setFont('helvetica', 'bold')
    doc.text('AqualityBill Admin', pageWidth / 2, pageHeight - 10, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' })
  }
}
