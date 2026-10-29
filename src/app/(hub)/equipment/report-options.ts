// What the office can choose for the equipment and materials report (widths are shares of the page).
export const EQUIPMENT_COLUMNS = [
  { key: "tag", label: "Tag", width: 0.1, default: true },
  { key: "category", label: "Category", width: 0.16, default: true },
  { key: "location", label: "Location", width: 0.22, default: true },
  { key: "status", label: "Status", width: 0.12, default: true },
  { key: "service", label: "Next service", width: 0.12, default: true },
  { key: "pat", label: "PAT test due", width: 0.12, default: true },
  { key: "serial", label: "Serial no.", width: 0.12, default: false },
] as const;

export const MATERIAL_COLUMNS = [
  { key: "category", label: "Category", width: 0.18, default: true },
  { key: "qty", label: "In stock", width: 0.14, default: true },
  { key: "locations", label: "Where", width: 0.3, default: true },
  { key: "min", label: "Minimum", width: 0.1, default: false },
  { key: "supplier", label: "Supplier", width: 0.18, default: false },
] as const;
