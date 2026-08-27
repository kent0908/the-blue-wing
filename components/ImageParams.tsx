"use client";

import Popover from "./Popover";
import { IconRatio, IconReset } from "./Icons";
import {
  defaultValues,
  type ImageControl,
  type ImageControlValues,
  type ImageModel,
} from "@/lib/imageModels";

/**
 * Parameter controls for the active image model. The control set is whatever
 * the model declares in lib/imageModels.ts, so switching models swaps the
 * knobs (Seedream gets negative prompt + seed, GPT-Image gets quality +
 * background, Gemini stays minimal, …).
 */
export default function ImageParams({
  model,
  values,
  onChange,
}: {
  model: ImageModel;
  values: ImageControlValues;
  onChange: (v: ImageControlValues) => void;
}) {
  const set = (key: string, value: string | number) => onChange({ ...values, [key]: value });

  const summary = model.controls
    .map((c) => {
      const v = values[c.key];
      if (v === undefined || v === "") return null;
      if (c.key === "n") return `×${v}`;
      if (c.key === "seed") return `seed ${v}`;
      if (c.key === "output_compression") return `壓縮 ${v}`;
      if (c.key === "negative_prompt") return "負向";
      return String(v);
    })
    .filter(Boolean) as string[];

  return (
    <Popover
      widthClass="w-[360px]"
      trigger={() => (
        <span className="flex items-center gap-2">
          <IconRatio className="h-[15px] w-[15px]" />
          {summary.length ? (
            summary.map((t, i) => (
              <span key={t + i} className="flex items-center gap-2">
                {i > 0 && <span className="h-3 w-px bg-[#3a3a3a]" />}
                <span>{t}</span>
              </span>
            ))
          ) : (
            <span>參數</span>
          )}
        </span>
      )}
    >
      {() => (
        <div className="p-3">
          <div className="flex items-center justify-between pb-3">
            <span className="min-w-0 truncate text-[13.5px] font-medium">{model.name} 參數</span>
            <button
              type="button"
              onClick={() => onChange(defaultValues(model))}
              className="flex shrink-0 items-center gap-1 text-[12px] text-[#8a8a8a] transition-colors hover:text-white"
            >
              <IconReset className="h-[13px] w-[13px]" />
              重設
            </button>
          </div>

          <div className="space-y-4 border-t border-[#262626] pt-3">
            {model.controls.map((c) => (
              <Field key={c.key} control={c} value={values[c.key]} onSet={(v) => set(c.key, v)} />
            ))}
          </div>

          <p className="mt-4 border-t border-[#262626] pt-2 text-[11px] leading-relaxed text-[#6d6d6d]">
            參數會依模型自動切換，只有此模型支援的欄位才會送出。實際扣款以回應中的 usage 為準。
          </p>
        </div>
      )}
    </Popover>
  );
}

function Field({
  control,
  value,
  onSet,
}: {
  control: ImageControl;
  value: string | number | undefined;
  onSet: (v: string | number) => void;
}) {
  return (
    <div>
      <div className="pb-2 text-[12.5px] text-[#a8a8a8]">{control.label}</div>

      {control.kind === "select" && (
        <div className="grid grid-cols-1 gap-2">
          {control.options!.map((o) => {
            const active = String(value ?? control.default ?? "") === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onSet(o.value)}
                className={[
                  "flex h-9 items-center justify-start gap-1.5 rounded-lg px-3 text-[13px] transition-colors",
                  active
                    ? "bg-[#2b2b2b] text-white ring-1 ring-[#4a4a4a]"
                    : "bg-[#232323] text-[#c9c9c9] hover:bg-[#2b2b2b]",
                ].join(" ")}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      {control.kind === "number" && (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={control.min}
            max={control.key === "seed" ? 100000 : control.max}
            step={control.step}
            value={Number(value ?? control.default ?? control.min ?? 0)}
            onChange={(e) => onSet(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[#333] accent-white"
          />
          <input
            type="number"
            min={control.min}
            max={control.max}
            step={control.step}
            placeholder={control.placeholder}
            value={value === undefined ? "" : value}
            onChange={(e) => onSet(e.target.value === "" ? "" : Number(e.target.value))}
            className="h-9 w-20 rounded-lg bg-[#232323] px-2 text-center text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-[#4a4a4a]"
          />
        </div>
      )}

      {control.kind === "text" && (
        <textarea
          rows={2}
          placeholder={control.placeholder}
          value={String(value ?? "")}
          onChange={(e) => onSet(e.target.value)}
          className="w-full resize-none rounded-lg bg-[#232323] px-3 py-2 text-[13px] leading-relaxed text-white placeholder:text-[#6d6d6d] focus:outline-none focus:ring-1 focus:ring-[#4a4a4a]"
        />
      )}
    </div>
  );
}
