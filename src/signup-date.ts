export function getSignupDays(monthValue: string, yearValue: string): number[] {
  const month = parseInt(monthValue);
  const year = parseInt(yearValue);
  if (!month || !year) return Array.from({ length: 31 }, (_, i) => i + 1);

  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => i + 1);
}
