import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { CBS_LOGO_PNG_BASE64 } from "./logo";

// The one house PDF format for every builder PDF (as the old hub: A4, orange top bar, logo,
// orange table headers, grey footer with "Page x of y"). Portrait unless `landscape: true`
// (wide tables such as the training matrix).

const MM = 72 / 25.4;
const A4_SHORT = 595.28;
const A4_LONG = 841.89;
const MARGIN = 14 * MM;
const FOOTER_SPACE = 14 * MM;

export const ORANGE = rgb(244 / 255, 121 / 255, 32 / 255);
const INK = rgb(29 / 255, 29 / 255, 29 / 255);
const GREY = rgb(107 / 255, 114 / 255, 128 / 255);
const LINE = rgb(217 / 255, 217 / 255, 214 / 255);
const COMPANY = "Chelmsford Building Services Ltd";

export type Column = { label: string; width: number }; // width as a fraction of the content width
// Optional background and text colour for one table cell, as "#rrggbb" (e.g. the training matrix).
export type CellColour = { fill: string; text?: string };

function hex(c: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return INK;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export class HousePdf {
  private page!: PDFPage;
  private y = 0;
  private readonly pageW: number;
  private readonly pageH: number;
  private readonly contentW: number;
  private constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private logo: PDFImage,
    private title: string,
    private jobNo: string | undefined,
    private subtitle: string | undefined,
    landscape: boolean,
  ) {
    this.pageW = landscape ? A4_LONG : A4_SHORT;
    this.pageH = landscape ? A4_SHORT : A4_LONG;
    this.contentW = this.pageW - MARGIN * 2;
  }

  static async create(opts: { title: string; jobNo?: string; subtitle?: string; landscape?: boolean }): Promise<HousePdf> {
    const doc = await PDFDocument.create();
    doc.setTitle(opts.jobNo ? `${opts.title} - Job ${opts.jobNo}` : opts.title);
    doc.setAuthor(COMPANY);
    doc.setProducer("CBS Operations Hub");
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const logo = await doc.embedPng(Buffer.from(CBS_LOGO_PNG_BASE64, "base64"));
    const pdf = new HousePdf(doc, font, bold, logo, opts.title, opts.jobNo, opts.subtitle, opts.landscape === true);
    pdf.newPage(true);
    return pdf;
  }

  // Standard PDF fonts only cover Western European characters; anything else is replaced.
  private safe(text: string, font: PDFFont = this.font): string {
    const ok = new Set(font.getCharacterSet());
    return Array.from(String(text ?? ""))
      .map((ch) => (ch === "\n" || ok.has(ch.codePointAt(0)!) ? ch : "?"))
      .join("");
  }

  private wrap(text: string, size: number, width: number, font: PDFFont = this.font): string[] {
    const lines: string[] = [];
    for (const para of this.safe(text, font).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= width) {
          line = test;
          continue;
        }
        if (line) lines.push(line);
        // Break words longer than the line.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
          let cut = w.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
          lines.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        line = w;
      }
      lines.push(line);
    }
    return lines;
  }

  private newPage(first = false) {
    this.page = this.doc.addPage([this.pageW, this.pageH]);
    this.page.drawRectangle({ x: 0, y: this.pageH - 3 * MM, width: this.pageW, height: 3 * MM, color: ORANGE });
    let top = this.pageH - 3 * MM - 6 * MM;
    if (first) {
      const maxW = 48 * MM;
      const h = Math.min(13 * MM, (maxW * this.logo.height) / this.logo.width);
      const w = (h * this.logo.width) / this.logo.height;
      this.page.drawImage(this.logo, { x: MARGIN, y: top - h, width: w, height: h });
      top -= h + 6 * MM;
      const title = this.jobNo ? `${this.title} - Job ${this.jobNo}` : this.title;
      for (const line of this.wrap(title, 15, this.contentW, this.bold)) {
        this.page.drawText(line, { x: MARGIN, y: top - 15, size: 15, font: this.bold, color: INK });
        top -= 19;
      }
      if (this.subtitle) {
        for (const line of this.wrap(this.subtitle, 9, this.contentW)) {
          this.page.drawText(line, { x: MARGIN, y: top - 9, size: 9, font: this.font, color: GREY });
          top -= 12;
        }
      }
      top -= 4 * MM;
    }
    this.y = top;
  }

  private room(height: number) {
    if (this.y - height < MARGIN + FOOTER_SPACE) this.newPage();
  }

  heading(text: string) {
    this.room(12.5 + 8 + 30);
    this.y -= 4;
    this.page.drawText(this.safe(text, this.bold), { x: MARGIN, y: this.y - 12.5, size: 12.5, font: this.bold, color: INK });
    this.y -= 12.5 + 3;
    this.page.drawRectangle({ x: MARGIN, y: this.y - 0.6 * MM, width: this.contentW, height: 0.6 * MM, color: ORANGE });
    this.y -= 0.6 * MM + 8;
  }

  paragraph(text: string, size = 9.5) {
    for (const line of this.wrap(text, size, this.contentW)) {
      this.room(size + 4);
      this.page.drawText(line, { x: MARGIN, y: this.y - size, size, font: this.font, color: INK });
      this.y -= size + 4;
    }
    this.y -= 6;
  }

  keyValues(pairs: [string, string][], size = 9.5) {
    const keyW = this.contentW * 0.3;
    for (const [k, v] of pairs) {
      const vLines = this.wrap(v || "-", size, this.contentW - keyW - 6);
      const kLines = this.wrap(k, size, keyW - 6, this.bold);
      const h = Math.max(vLines.length, kLines.length) * (size + 3) + 4;
      this.room(h);
      kLines.forEach((l, i) => this.page.drawText(l, { x: MARGIN, y: this.y - size - i * (size + 3), size, font: this.bold, color: INK }));
      vLines.forEach((l, i) => this.page.drawText(l, { x: MARGIN + keyW, y: this.y - size - i * (size + 3), size, font: this.font, color: INK }));
      this.y -= h;
    }
    this.y -= 6;
  }

  // `cellColours` (optional, off by default): a colour per cell, same shape as `rows`; null or
  // missing cells keep the plain style.
  table(columns: Column[], rows: string[][], opts: { cellColours?: (CellColour | null | undefined)[][] } = {}) {
    const size = 8.5;
    const pad = 4;
    const widths = columns.map((c) => c.width * this.contentW);
    const header = () => {
      const hLines = columns.map((c, i) => this.wrap(c.label, size, widths[i] - pad * 2, this.bold));
      const h = Math.max(...hLines.map((l) => l.length)) * (size + 2) + pad * 2;
      this.room(h + size * 3);
      this.page.drawRectangle({ x: MARGIN, y: this.y - h, width: this.contentW, height: h, color: ORANGE });
      let x = MARGIN;
      hLines.forEach((lines, i) => {
        lines.forEach((l, j) => this.page.drawText(l, { x: x + pad, y: this.y - pad - size - j * (size + 2), size, font: this.bold, color: rgb(1, 1, 1) }));
        x += widths[i];
      });
      this.y -= h;
    };
    header();
    for (const [r, row] of rows.entries()) {
      const cells = columns.map((_, i) => this.wrap(row[i] ?? "", size, widths[i] - pad * 2));
      const h = Math.max(...cells.map((l) => l.length)) * (size + 2) + pad * 2;
      if (this.y - h < MARGIN + FOOTER_SPACE) {
        this.newPage();
        header();
      }
      let x = MARGIN;
      cells.forEach((lines, i) => {
        const colour = opts.cellColours?.[r]?.[i];
        if (colour) this.page.drawRectangle({ x: x + 0.5, y: this.y - h + 0.5, width: widths[i] - 1, height: h - 1, color: hex(colour.fill) });
        const text = colour?.text ? hex(colour.text) : INK;
        lines.forEach((l, j) => this.page.drawText(l, { x: x + pad, y: this.y - pad - size - j * (size + 2), size, font: this.font, color: text }));
        x += widths[i];
      });
      this.y -= h;
      this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + this.contentW, y: this.y }, thickness: 0.5, color: LINE });
    }
    this.y -= 10;
  }

  async finish(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    const left = this.safe(`${COMPANY}${this.jobNo ? ` | Job ${this.jobNo}` : ""} | ${this.title}`);
    pages.forEach((p, i) => {
      const y = MARGIN / 1.6;
      p.drawText(left, { x: MARGIN, y, size: 7.5, font: this.font, color: GREY });
      const right = `Page ${i + 1} of ${pages.length}`;
      p.drawText(right, { x: this.pageW - MARGIN - this.font.widthOfTextAtSize(right, 7.5), y, size: 7.5, font: this.font, color: GREY });
    });
    return this.doc.save();
  }
}
