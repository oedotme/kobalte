export const CALENDAR_INTL_TRANSLATIONS = {
  previous: "Previous",
  next: "Next",
  selectedDateDescription: (date: string) => `Selected Date: ${date}`,
  selectedRangeDescription: (dateRange: string) => `Selected Range: ${dateRange}`,
  todayDate: (date: string) => `Today, ${date}`,
  todayDateSelected: (date: string) => `Today, ${date} selected`,
  dateSelected: (date: string) => `${date} selected`,
  startRangeSelectionPrompt: "Click to start selecting date range",
  finishRangeSelectionPrompt: "Click to finish selecting date range",
  minimumDate: "First available date",
  maximumDate: "Last available date",
  dateRange: (startDate: string, endDate: string) => `${startDate} to ${endDate}`,
};

export type CalendarIntlTranslations = typeof CALENDAR_INTL_TRANSLATIONS;
