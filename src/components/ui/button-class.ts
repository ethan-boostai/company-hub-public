// The Button's look, usable from server pages too (e.g. a link styled as a button).
// See ./button.tsx for when to use each tone and size.
export type ButtonTone = "primary" | "secondary" | "danger" | "quiet";
export type ButtonSize = "page" | "form" | "small";

const TONE: Record<ButtonTone, string> = {
  primary: "border border-brand bg-brand font-semibold text-white hover:bg-brand-dark",
  secondary: "border border-line bg-white font-medium text-ink hover:bg-paper",
  danger: "border border-danger bg-danger font-semibold text-white hover:opacity-90",
  quiet: "border border-transparent bg-transparent font-medium text-ink hover:bg-paper",
};
const SIZE: Record<ButtonSize, string> = {
  page: "h-11 px-4 text-[15px]",
  form: "px-4 py-2 text-[15px]",
  small: "px-3 py-1.5 text-sm",
};

export function buttonClass(tone: ButtonTone = "secondary", size: ButtonSize = "form", extra = "") {
  return `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg disabled:cursor-not-allowed disabled:opacity-55 ${TONE[tone]} ${SIZE[size]} ${extra}`.trim();
}

