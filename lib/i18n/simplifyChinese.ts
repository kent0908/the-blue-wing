import { Converter } from "opencc-js/t2cn";

const taiwanToSimplified = Converter({ from: "twp", to: "cn" });

const interfaceTerms: Record<string, string> = {
  纪录: "记录",
  送出: "提交",
  注销: "退出登录",
  拷贝: "复制",
  范本: "模板",
};

function simplifyText(text: string): string {
  return taiwanToSimplified(text).replace(/纪录|送出|注销|拷贝|范本/g, term => interfaceTerms[term]);
}

/** Converts authored interface copy while keeping message keys and placeholders intact. */
export function simplifyChinese<T>(value: T): T {
  if (typeof value === "string") return simplifyText(value) as T;
  if (Array.isArray(value)) return value.map(simplifyChinese) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, copy]) => [key, simplifyChinese(copy)])) as T;
  }
  return value;
}
