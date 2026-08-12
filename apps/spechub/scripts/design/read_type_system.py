"""
Read the datasheet type system out of the source, so the reference page
cannot disagree with what the layouts actually print.

The type-spec page used to restate every size and weight as a hand-typed
string. That is the same failure the shared scale removed from the four
layout components — a value with no single source drifts — except the copy
that drifts is the one external designers are told to trust, and nothing
errors when it does.

Nothing here is authoritative. `lib/datasheet/scale.ts` owns the steps, the
components own which step each role uses, and `typography.ts` owns the
standard layout's editable metrics. This module only reads them.

Deliberately a regex reader rather than a TS build step: the shapes it
depends on are small and it fails loudly when they change (every lookup
raises on a miss), which is the property that matters. If the components
ever stop writing `font-size: ${PT.x}pt` literally, this breaks noisily
instead of emitting stale numbers.
"""
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent.parent / "src"
PREVIEW = SRC / "app" / "(print)" / "preview"

COMPONENTS = {
    "A": PREVIEW / "[model]" / "page.tsx",
    "B": PREVIEW / "[model]" / "datacenter-preview.tsx",
    "C": PREVIEW / "[model]" / "broadband-preview.tsx",
    "D": PREVIEW / "series" / "[line]" / "edge-ai-series-preview.tsx",
}


def _obj(text: str, name: str) -> dict[str, float]:
    """Numeric members of `export const NAME = { ... }`."""
    m = re.search(rf"export const {name} = {{(.*?)}} as const;", text, re.S)
    if not m:
        raise SystemExit(f"read_type_system: no `{name}` object found")
    out = {}
    for key, val in re.findall(r"(\w+):\s*([\d.]+),", m.group(1)):
        out[key] = float(val) if "." in val else int(val)
    if not out:
        raise SystemExit(f"read_type_system: `{name}` parsed empty")
    return out


def read_scale() -> tuple[dict, dict, dict]:
    """PT, WT and the auto-fit ladders from scale.ts."""
    text = (SRC / "lib" / "datasheet" / "scale.ts").read_text()
    pt, wt = _obj(text, "PT"), _obj(text, "WT")

    ladders = {}
    block = re.search(r"export const LADDER = {(.*?)} as const;", text, re.S)
    if block:
        for key, body in re.findall(r"(\w+):\s*\[([^\]]+)\]", block.group(1)):
            rungs = []
            for token in (t.strip() for t in body.split(",")):
                if token.startswith("PT."):
                    rungs.append(pt[token[3:]])
                elif re.fullmatch(r"[\d.]+", token):
                    rungs.append(float(token) if "." in token else int(token))
            ladders[key] = rungs
    return pt, wt, ladders


def read_typography_defaults(locale: str = "en") -> dict:
    """The standard layout's editable metrics for one locale.

    These are what the layout renders when `app_settings` carries no row —
    true for en and es. ja and zh-TW ARE overridden in the database, so a
    number read here does not describe them.
    """
    text = (SRC / "lib" / "datasheet" / "typography.ts").read_text()
    m = re.search(rf"\b{re.escape(locale)}: {{(.*?)}},\n", text, re.S)
    if not m:
        raise SystemExit(f"read_type_system: no TYPOGRAPHY_DEFAULTS.{locale}")
    out = {}
    for key, val in re.findall(r"(\w+):\s*([\d.]+),", m.group(1)):
        out[key] = float(val) if "." in val else int(val)
    return out


def _css_of(path: pathlib.Path) -> str:
    """The component's inline stylesheet, comments removed.

    Comments must go before rules are matched: a `/* ... */` sitting above a
    rule is otherwise swallowed into that rule's selector text, and the rule
    gets filed under the comment instead of under `.section-title`. These
    stylesheets are heavily commented, so this silently loses most of them.
    """
    m = re.search(r"__html: `(.*?)`,\n", path.read_text(), re.S)
    if not m:
        raise SystemExit(f"read_type_system: no inline CSS in {path.name}")
    return re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S)


_RULE = re.compile(r"([^{}]+?)\s*\{([^{}]*)\}", re.S)


def _mask(css: str) -> tuple[str, list[str]]:
    """Hide `${...}` interpolations so CSS braces can be matched.

    The stylesheets are template literals, so they are full of `${theme.x}`
    and `${PT.y}`. Those braces are indistinguishable from rule braces to a
    regex, which is why an unmasked parse silently finds nothing at all.
    Innermost-first, so a nested interpolation collapses before its parent.
    """
    slots: list[str] = []
    inner = re.compile(r"\$\{[^{}]*\}")
    while True:
        m = inner.search(css)
        if not m:
            break
        slots.append(m.group(0))
        css = css[: m.start()] + f"\x00{len(slots) - 1}\x00" + css[m.end() :]
    return css, slots


def _unmask(value: str, slots: list[str]) -> str:
    return re.sub(r"\x00(\d+)\x00", lambda m: slots[int(m.group(1))], value)


def read_component(layout: str, pt: dict, wt: dict, typo: dict) -> dict[str, dict]:
    """selector -> resolved declarations, applied in source order.

    Last write wins per property. That is not a real cascade, but these
    stylesheets use single-class selectors with no specificity contests, so
    source order IS the cascade here. Grouped rules apply to each selector
    they name, which is how the shared heading rule reaches all five titles.
    """
    css, slots = _mask(_css_of(COMPONENTS[layout]))
    resolved: dict[str, dict] = {}
    for raw_selectors, body in _RULE.findall(css):
        selectors = [s.strip() for s in raw_selectors.split(",") if s.strip()]
        if not selectors or any(s.startswith("@") for s in selectors):
            continue
        decls = {}
        for prop, value in re.findall(r"([a-z-]+)\s*:\s*([^;]+);", body):
            if prop not in ("font-size", "font-weight"):
                continue
            got = _resolve(_unmask(value.strip(), slots), pt, wt, typo)
            if got is not None:
                decls[prop] = got
        if decls:
            for sel in selectors:
                resolved.setdefault(sel, {}).update(decls)
    return resolved


def _resolve(value: str, pt: dict, wt: dict, typo: dict):
    """A CSS value to a number, or None when it is not statically knowable."""
    m = re.fullmatch(r"\$\{PT\.(\w+)\}pt", value)
    if m:
        return pt[m.group(1)]
    m = re.fullmatch(r"\$\{WT\.(\w+)\}", value)
    if m:
        return wt[m.group(1)]
    m = re.fullmatch(r"\$\{typo\.(\w+)\}(?:pt)?", value)
    if m:
        return typo.get(m.group(1))
    m = re.fullmatch(r"([\d.]+)(?:pt)?", value)
    if m:
        return float(m.group(1)) if "." in m.group(1) else int(m.group(1))
    return None  # theme colour, computed size, ladder variable


def audit_off_scale(pt: dict) -> list[str]:
    """Font sizes written as literals instead of scale steps.

    The point of the shared scale is that a layout cannot quietly introduce
    a new size. This is what enforces it — the generator refuses to publish
    a reference page describing a scale the code does not follow.
    """
    steps = set(pt.values())
    problems = []
    for layout, path in COMPONENTS.items():
        masked, _ = _mask(_css_of(path))
        for value in re.findall(r"font-size:\s*([\d.]+)pt", masked):
            num = float(value) if "." in value else int(value)
            if num not in steps:
                problems.append(f"{layout} ({path.name}): font-size {value}pt is not a scale step")
    return problems
