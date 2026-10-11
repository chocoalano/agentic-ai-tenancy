-- 0006_pgvector: persiapan pgvector untuk fitur AI berikutnya (knowledge, memory).
--
-- Migrasi ini aman dijalankan pada server tanpa pgvector: ekstensi hanya
-- dibuat bila tersedia dan role migrasi berhak membuatnya. pgvector bukan
-- ekstensi "trusted", sehingga pada banyak server ekstensi dibuat oleh
-- superuser melalui `bun run db:bootstrap`. Belum ada tabel vektor di Phase 1.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    raise notice 'pgvector sudah aktif.';
  elsif exists (select 1 from pg_available_extensions where name = 'vector') then
    begin
      create extension vector;
      raise notice 'pgvector berhasil diaktifkan.';
    exception when insufficient_privilege then
      raise notice 'pgvector tersedia tetapi role migrasi tidak berhak membuatnya; jalankan "bun run db:bootstrap" dengan superuser.';
    end;
  else
    raise notice 'pgvector tidak tersedia pada server ini; dilewati.';
  end if;
end
$$;
