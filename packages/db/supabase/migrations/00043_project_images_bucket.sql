-- Product imagery for project datasheets — a SECOND bucket, on purpose.
--
-- `project-datasheets` (00038) is private and holds evidence: the ODM PDFs
-- and spreadsheets a quoted spec came from. Nothing in it is ever meant to
-- leave the company.
--
-- Product photography is the opposite kind of object. It is printed onto a
-- document we hand to a customer, and the renderer reaches it with a plain
-- `<img src>` — from the author's browser when they print, and from a
-- headless Chrome when the PDF is generated server-side. A signed URL would
-- expire and quietly turn a shipped datasheet's images into broken icons
-- months later; proxying through an authenticated route would work in the
-- browser and fail in Puppeteer, which carries no session.
--
-- So: images public, sources private. Same split the catalogue already has —
-- the `datasheets` bucket is public and serves product renders today.
--
-- ⚠️ Public means readable by anyone holding the URL. That is correct for
-- EnGenius hardware renders and wrong for anything else, which is why the
-- upload route accepts images only and the editor says so.

insert into storage.buckets (id, name, public)
values ('project-images', 'project-images', true)
on conflict (id) do update set public = true;

-- Writes go through the service-role client in the API route, which bypasses
-- RLS entirely — the gate is `project_datasheet.edit`, not a storage policy.
-- Reads need no policy on a public bucket.
