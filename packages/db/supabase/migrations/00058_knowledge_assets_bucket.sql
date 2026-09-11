-- Private bucket for images that belong to indexed knowledge — today the
-- diagrams inside internal doc packages (source_type 'internal_doc'), which an
-- answer shows when it cites the section a diagram sits in.
--
-- Separate from knowledge-files on purpose: that one is PDF-only (00020) and
-- holds user uploads; this one holds images an ingest script puts there.
-- Private with 0 storage policies = service-role only. Readers never touch it
-- directly: /api/knowledge-assets/<path> checks the session (ask.use) and
-- redirects to a short-lived signed URL, so the image is served from
-- Supabase's origin, never ours — an SVG opened as a page cannot script
-- against an EnGenie session.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge-assets',
  'knowledge-assets',
  false,
  5242880, -- 5 MB
  array['image/svg+xml','image/png','image/jpeg','image/webp']
)
on conflict (id) do nothing;
