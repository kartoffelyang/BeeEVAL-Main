import type { TaskDetailStat, VehicleAcceptanceTaskDetail } from "../../api";
export type ComparisonMode = "rate" | "score";
export interface IndustryRow {
  key: string;
  grade: string;
  task: string;
  primary: number | null;
  reference: number | null;
  delta: number | null;
  primaryCases: number;
  referenceCases: number;
  referenceVehicles: number;
}
export function sortIndustryRows(
  rows: IndustryRow[],
  field: "task" | "primary" | "reference" | "delta",
  direction: "asc" | "desc",
): IndustryRow[] {
  if (field === "task") return [...rows];
  return [...rows].sort((a, b) => {
    const av = a[field],
      bv = b[field];
    if (av === null) return bv === null ? a.key.localeCompare(b.key) : 1;
    if (bv === null) return -1;
    return (
      (av - bv) * (direction === "asc" ? 1 : -1) || a.key.localeCompare(b.key)
    );
  });
}
const GRADES = ["基础验收", "中等验收", "进阶验收"];
function value(stat: TaskDetailStat | undefined, mode: ComparisonMode) {
  const n = mode === "score" ? stat?.score : stat?.completion_rate;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
export function industryRows(
  primary: VehicleAcceptanceTaskDetail | undefined,
  references: Array<VehicleAcceptanceTaskDetail | undefined>,
  mode: ComparisonMode,
  gradeFilter = "all",
): IndustryRow[] {
  const all = new Map<
    string,
    {
      grade: string;
      task: string;
      primary?: TaskDetailStat;
      refs: TaskDetailStat[];
    }
  >();
  const add = (
    data: VehicleAcceptanceTaskDetail | undefined,
    isPrimary: boolean,
  ) => {
    for (const g of data?.by_grade || []) {
      if (gradeFilter !== "all" && g.grade !== gradeFilter) continue;
      for (const task of g.task_details) {
        const key = g.grade + "||" + task.task_detail;
        const entry = all.get(key) || {
          grade: g.grade,
          task: task.task_detail,
          refs: [],
        };
        if (isPrimary) entry.primary = task;
        else entry.refs.push(task);
        all.set(key, entry);
      }
    }
  };
  add(primary, true);
  references.forEach((r) => add(r, false));
  return [...all.entries()]
    .map(([key, row]) => {
      const p = value(row.primary, mode),
        numbers = row.refs
          .map((r) => value(r, mode))
          .filter((n): n is number => n !== null);
      const reference = numbers.length
        ? numbers.reduce((s, v) => s + v, 0) / numbers.length
        : null;
      return {
        key,
        grade: row.grade,
        task: row.task,
        primary: p,
        reference,
        delta: p !== null && reference !== null ? p - reference : null,
        primaryCases: row.primary?.case_count || 0,
        referenceCases: row.refs.reduce((s, r) => s + r.case_count, 0),
        referenceVehicles: numbers.length,
      };
    })
    .sort(
      (a, b) =>
        GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade) ||
        a.task.localeCompare(b.task, "zh-CN"),
    );
}
