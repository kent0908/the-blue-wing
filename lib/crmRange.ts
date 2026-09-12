export interface CrmRange { from: string; to: string; since: string; until: string; dates: string[] }
export function reportRange(days = 30, from?: string, to?: string, now = new Date()): CrmRange {
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0,10);
  const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
  if (!!from !== !!to || (from && !valid(from)) || (to && !valid(to))) throw new Error("日期格式不正確，請同時選擇起訖日期");
  const end = to || today;
  const start = from || new Date(Date.parse(end) - (days - 1) * 86400000).toISOString().slice(0,10);
  const count = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  if (count < 1 || count > 366) throw new Error("日期區間須由早到晚，最多 366 天");
  const dates = Array.from({length:count}, (_,i) => new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10));
  return {from:start,to:end,since:new Date(Date.parse(start)-8*3600000).toISOString(),until:new Date(Date.parse(end)+16*3600000).toISOString(),dates};
}
