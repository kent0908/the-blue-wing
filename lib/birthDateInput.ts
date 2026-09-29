/** Calendar options only; eligibility continues to be checked by the server. */
export function birthDateDays(year: string, month: string): number {
 const y = Number(year), m = Number(month);
 if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || m < 1 || m > 12) return 0;
 return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function selectedBirthDate(year: string, month: string, day: string): string {
 const max = birthDateDays(year, month), d = Number(day);
 if (!/^\d{1,2}$/.test(day) || !Number.isInteger(d) || d < 1 || d > max) return "";
 return `${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`;
}
