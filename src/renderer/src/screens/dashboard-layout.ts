// تخصيص الشاشة الرئيسية: كل مستخدم بيختار شو يشوف من مربعات الإحصائيات وبأي ترتيب،
// وشو يخفي من البطاقات. محفوظ على هالجهاز لكل شركة ولكل مستخدم.
import { useCallback, useState } from 'react';

export interface DashLayout {
  /** المربعات الظاهرة بالترتيب. */
  stats: string[];
  /** البطاقات المخفية. */
  hidden: string[];
}

export const DEFAULT_STATS = ['todaySales', 'todayProfit', 'monthSales', 'monthProfit', 'receivables', 'payables', 'cash', 'usd'];

export const DASH_CARDS: { id: string; label: string }[] = [
  { id: 'dailyProfit', label: 'ربح اليوم بالتفصيل' },
  { id: 'week', label: 'مبيعات آخر 7 أيام' },
  { id: 'top', label: 'الأكثر مبيعاً هالشهر' },
  { id: 'dueDebts', label: 'ديون حان موعد سدادها' },
  { id: 'low', label: 'النواقص' },
  { id: 'expiring', label: 'الصلاحيات القريبة' },
];

const defaults = (): DashLayout => ({ stats: [...DEFAULT_STATS], hidden: [] });

function read(key: string): DashLayout {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<DashLayout> | null;
    if (!raw || !Array.isArray(raw.stats)) return defaults();
    return { stats: raw.stats.filter((s) => typeof s === 'string'), hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((s) => typeof s === 'string') : [] };
  } catch {
    return defaults();
  }
}

export function useDashLayout(scope: string): [DashLayout, (l: DashLayout | null) => void] {
  const key = `wazn.dashboard.${scope}`;
  const [layout, setLayout] = useState<DashLayout>(() => read(key));
  const save = useCallback(
    (l: DashLayout | null) => {
      const next = l ?? defaults();
      setLayout(next);
      try {
        if (l) localStorage.setItem(key, JSON.stringify(next));
        else localStorage.removeItem(key);
      } catch {
        /* التخزين مسكّر: بيضل للجلسة بس */
      }
    },
    [key],
  );
  return [layout, save];
}
