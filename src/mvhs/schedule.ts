export type ScheduleBlock = {
  label: string;
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
};

export type MvhsDay = {
  kind: "school-day" | "no-school";
  dateKey: string;
  scheduleName: string;
  reason: string;
  blocks: ScheduleBlock[];
  active: ScheduleBlock | null;
  next: ScheduleBlock | null;
  minutesUntilNext: number | null;
};

export const MVHS_SCHEDULE_SOURCE = {
  label: "MVHS 2025–26 bell schedule · reference template; 2026–27 times not yet confirmed",
  url: "https://mvhs.fuhsd.org/about-us/general-information/bell-schedule",
} as const;

export const FUHSD_CALENDAR_SOURCE = {
  label: "FUHSD academic calendar · 2026–27",
  url: "https://www.fuhsd.org/about-us/general-information/calendar",
} as const;

function minutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})\s(AM|PM)$/.exec(time);
  if (!match) throw new Error(`Invalid schedule time: ${time}`);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3] === "PM" && hour !== 12) hour += 12;
  if (match[3] === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function block(label: string, start: string, end: string): ScheduleBlock {
  return { label, start, end, startMinutes: minutes(start), endMinutes: minutes(end) };
}

const MONDAY = [
  block("Period 1", "8:30 AM", "9:15 AM"),
  block("Period 2", "9:20 AM", "10:05 AM"),
  block("Tutorial", "10:10 AM", "10:35 AM"),
  block("Period 3", "10:40 AM", "11:25 AM"),
  block("Brunch", "11:25 AM", "11:45 AM"),
  block("Period 4", "11:50 AM", "12:35 PM"),
  block("Period 5", "12:40 PM", "1:25 PM"),
  block("Lunch", "1:25 PM", "2:10 PM"),
  block("Period 6", "2:15 PM", "3:00 PM"),
  block("Period 7", "3:05 PM", "3:50 PM"),
];

const TUESDAY_THURSDAY = [
  block("Period 1", "8:30 AM", "10:00 AM"),
  block("Period 2", "10:05 AM", "11:35 AM"),
  block("Brunch", "11:35 AM", "11:55 AM"),
  block("Period 3", "12:00 PM", "1:30 PM"),
  block("Lunch", "1:30 PM", "2:15 PM"),
  block("Period 7", "2:20 PM", "3:50 PM"),
];

const WEDNESDAY_FRIDAY = [
  block("Period 4", "8:30 AM", "10:05 AM"),
  block("Tutorial", "10:10 AM", "10:50 AM"),
  block("Brunch", "10:50 AM", "11:10 AM"),
  block("Period 5", "11:15 AM", "12:45 PM"),
  block("Lunch", "12:45 PM", "1:30 PM"),
  block("Period 6", "1:35 PM", "3:05 PM"),
];

const NO_SCHOOL: Record<string, string> = {
  "2026-09-07": "Labor Day · no classes",
  "2026-10-12": "Teacher non-duty day · no classes",
  "2026-11-11": "Veterans Day · no classes",
  "2026-11-25": "Thanksgiving Break · no classes",
  "2026-11-26": "Thanksgiving Break · no classes",
  "2026-11-27": "Thanksgiving Break · no classes",
  "2026-12-21": "Mid-Year Break · no classes",
  "2026-12-22": "Mid-Year Break · no classes",
  "2026-12-23": "Mid-Year Break · no classes",
  "2026-12-24": "Mid-Year Break · no classes",
  "2026-12-25": "Mid-Year Break · no classes",
  "2026-12-28": "Mid-Year Break · no classes",
  "2026-12-29": "Mid-Year Break · no classes",
  "2026-12-30": "Mid-Year Break · no classes",
  "2026-12-31": "Mid-Year Break · no classes",
  "2027-01-01": "Mid-Year Break · no classes",
  "2027-01-18": "Martin Luther King Day · no classes",
  "2027-02-15": "President's Week · no classes",
  "2027-02-16": "President's Week · no classes",
  "2027-02-17": "President's Week · no classes",
  "2027-02-18": "President's Week · no classes",
  "2027-02-19": "President's Week · no classes",
  "2027-03-15": "Non-duty day · no classes",
  "2027-04-12": "Spring Break · no classes",
  "2027-04-13": "Spring Break · no classes",
  "2027-04-14": "Spring Break · no classes",
  "2027-04-15": "Spring Break · no classes",
  "2027-04-16": "Spring Break · no classes",
  "2027-05-31": "Memorial Day · no classes",
};

function noSchool(dateKey: string, reason: string): MvhsDay {
  return {
    kind: "no-school",
    dateKey,
    scheduleName: "No school",
    reason,
    blocks: [],
    active: null,
    next: null,
    minutesUntilNext: null,
  };
}

export function getMvhsDay(dateKey: string, minuteOfDay: number): MvhsDay {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("Date must use YYYY-MM-DD.");
  if (!Number.isFinite(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= 24 * 60) {
    throw new Error("Minute of day must be between 0 and 1439.");
  }

  if (dateKey < "2026-08-17") return noSchool(dateKey, "Before the first day of school · August 17");
  if (dateKey > "2027-06-03") return noSchool(dateKey, "After the last day of school · June 3");
  if (NO_SCHOOL[dateKey]) return noSchool(dateKey, NO_SCHOOL[dateKey]);

  const dayOfWeek = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return noSchool(dateKey, "Weekend · no classes");

  let blocks: ScheduleBlock[];
  let scheduleName: string;
  if (dayOfWeek === 1) {
    blocks = MONDAY;
    scheduleName = "Monday regular schedule";
  } else if (dayOfWeek === 2 || dayOfWeek === 4) {
    blocks = TUESDAY_THURSDAY;
    scheduleName = "Tuesday / Thursday regular schedule";
  } else {
    blocks = WEDNESDAY_FRIDAY;
    scheduleName = "Wednesday / Friday regular schedule";
  }

  const activeIndex = blocks.findIndex(
    (item) => minuteOfDay >= item.startMinutes && minuteOfDay < item.endMinutes,
  );
  const active = activeIndex >= 0 ? blocks[activeIndex] : null;
  const next = activeIndex >= 0
    ? blocks[activeIndex + 1] ?? null
    : blocks.find((item) => item.startMinutes > minuteOfDay) ?? null;

  return {
    kind: "school-day",
    dateKey,
    scheduleName,
    reason: "2025–26 reference template · not confirmed for 2026–27",
    blocks,
    active,
    next,
    minutesUntilNext: next ? Math.max(0, next.startMinutes - minuteOfDay) : null,
  };
}
