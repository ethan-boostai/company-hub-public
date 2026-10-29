// England and Wales bank holidays, from the gov.uk list (https://www.gov.uk/bank-holidays), stored
// in the app rather than looked up live (Ethan, 30/10/2026). Substitute days are the dates gov.uk
// gives (e.g. 28 Dec 2026, when Boxing Day falls on a Saturday).
// Add the next year when gov.uk publishes it, and move LAST_YEAR on. Requests after LAST_YEAR are
// still counted (Monday to Friday) but flagged so the office checks the count.
export const BANK_HOLIDAYS_LAST_YEAR = 2027;

export const BANK_HOLIDAYS: Record<string, string> = {
  "2024-01-01": "New Year's Day",
  "2024-03-29": "Good Friday",
  "2024-04-01": "Easter Monday",
  "2024-05-06": "Early May bank holiday",
  "2024-05-27": "Spring bank holiday",
  "2024-08-26": "Summer bank holiday",
  "2024-12-25": "Christmas Day",
  "2024-12-26": "Boxing Day",
  "2025-01-01": "New Year's Day",
  "2025-04-18": "Good Friday",
  "2025-04-21": "Easter Monday",
  "2025-05-05": "Early May bank holiday",
  "2025-05-26": "Spring bank holiday",
  "2025-08-25": "Summer bank holiday",
  "2025-12-25": "Christmas Day",
  "2025-12-26": "Boxing Day",
  "2026-01-01": "New Year's Day",
  "2026-04-03": "Good Friday",
  "2026-04-06": "Easter Monday",
  "2026-05-04": "Early May bank holiday",
  "2026-05-25": "Spring bank holiday",
  "2026-08-31": "Summer bank holiday",
  "2026-12-25": "Christmas Day",
  "2026-12-28": "Boxing Day (substitute day)",
  "2027-01-01": "New Year's Day",
  "2027-03-26": "Good Friday",
  "2027-03-29": "Easter Monday",
  "2027-05-03": "Early May bank holiday",
  "2027-05-31": "Spring bank holiday",
  "2027-08-30": "Summer bank holiday",
  "2027-12-27": "Christmas Day (substitute day)",
  "2027-12-28": "Boxing Day (substitute day)",
};
