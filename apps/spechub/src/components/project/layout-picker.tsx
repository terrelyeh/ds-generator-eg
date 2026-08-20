"use client";

import { PROJECT_LAYOUTS } from "@/lib/project-datasheet/themes";

/**
 * Pick the look, by looking at it.
 *
 * A dropdown of names ("Steel Blue (outdoor / broadband)") tells you nothing
 * about what comes out of the printer, and the only way to compare two was to
 * choose one, save, and open the preview. Swatches show the three colours
 * that actually differ between layouts: the cover band, the spec table's
 * header bar, and the tint behind the features blocks.
 */
export function LayoutPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {Object.entries(PROJECT_LAYOUTS).map(([key, theme]) => {
          const active = key === value;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`w-[132px] overflow-hidden rounded-md border text-left transition-colors ${
                active ? "border-[#231f20] ring-1 ring-[#231f20]" : "hover:border-foreground/40"
              }`}
            >
              {/* A miniature of the real thing: header band, a title line,
                  the dark spec band, two rows, the features tint. */}
              <div className="h-3.5 w-full" style={{ background: theme.headerBg }} />
              <div className="space-y-1 bg-white p-1.5">
                <div className="h-1.5 w-3/4 rounded-sm" style={{ background: theme.primary }} />
                <div className="h-1 w-1/2 rounded-sm bg-neutral-300" />
                <div className="h-2 w-full rounded-sm" style={{ background: theme.bandDark }} />
                <div className="h-1.5 w-full rounded-sm" style={{ background: theme.rowAlt }} />
                <div className="h-1.5 w-full rounded-sm" style={{ background: theme.featuresBox }} />
              </div>
              <div
                className={`border-t px-1.5 py-1 text-[10px] leading-tight ${
                  active ? "bg-[#231f20] text-white" : "bg-muted/50 text-muted-foreground"
                }`}
              >
                {theme.label}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        只有配色不同，版面結構都一樣。改完按上面「預覽 / 列印」看實際效果。
        <br />
        要加新的配色或全新版面，目前得改程式（
        <code className="rounded bg-muted px-1">lib/project-datasheet/themes.ts</code>
        ）—— 加一組配色是加一筆設定，加一種真的不同的版面才要寫新元件。跟工程說一聲就行。
      </p>
    </div>
  );
}
