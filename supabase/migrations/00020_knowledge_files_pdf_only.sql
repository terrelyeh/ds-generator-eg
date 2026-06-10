-- Files channel is PDF-only (Word/.docx dropped — no AI extraction benefit and
-- can't be fed to Gemini directly). Narrow the bucket's allowed MIME types so
-- only PDFs can be stored.
update storage.buckets
set allowed_mime_types = array['application/pdf']
where id = 'knowledge-files';
