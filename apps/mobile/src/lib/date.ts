const dayMonth = new Intl.DateTimeFormat("ar", { day: "numeric", month: "long" });

/** «12 مايو» — day + Arabic month name, no year, matching the card-face chip. */
export function formatDueDate(iso: string): string {
  return dayMonth.format(new Date(iso));
}

export function isOverdue(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}
