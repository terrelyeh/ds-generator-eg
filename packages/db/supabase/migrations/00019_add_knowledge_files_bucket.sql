-- Private Storage bucket for uploaded Knowledge files (PDF / Word).
-- The original file is stored here for "view original"; its extracted text is
-- chunked + embedded into `documents` (source_type 'file'). Private bucket with
-- 0 storage policies = service-role only (the server uses the admin client to
-- upload and to mint short-lived signed URLs), mirroring api_keys / ask_workspaces.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge-files',
  'knowledge-files',
  false,
  5242880, -- 5 MB (Vercel request body caps the real upload at ~4.5 MB anyway)
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;
