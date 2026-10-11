# Integrasi Event Live ke Game Virtual Office

Phase 5 menghubungkan game `/office` dengan eksekusi agent nyata: perintah dari panel menjadi tugas di backend, event
SSE menggerakkan animasi robot, dan hasil dibaca dari API. Dokumen ini menjabarkan pemetaan dan pemisahan ketat antara
mode **live** (data backend) dan mode **pratinjau** (simulasi frontend berlabel SIMULASI/DEMO).

**Status:** VERIFIED COMPLETE dengan runtime `fixture` (QA browser 1920×1080, 1440×900, 768×1024, 390×844; rekaman
`docs/screenshots/office-live-task-p5.mp4`). Dengan provider AI nyata: BLOCKED (tanpa kredensial di lingkungan ini).

## 1. Sumber kebenaran

| Data                                  | Sumber                                                                  | Komponen                                  |
| ------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| Roster & status runtime agent         | `GET /api/v1/agents` (`runtimeStatus`, `currentTaskId`, `currentRunId`) | `GameOffice.vue` via `useTenantAsyncData` |
| Kemampuan runtime & izin              | `GET /api/v1/tasks/capabilities`                                        | panel perintah (`AgentCommandPanel.vue`)  |
| Tugas per agent, persetujuan tertunda | `GET /api/v1/tasks?agentId=…`, `GET /api/v1/approvals?status=pending`   | panel perintah, riwayat                   |
| Hasil                                 | `GET /api/v1/runs/:id/output`                                           | panel ("Lihat hasil"), `/tasks/:id`       |
| Perubahan status realtime             | SSE `GET /api/v1/realtime/stream`                                       | `useOfficeRealtime` → `mapRealtimeEvent`  |

Status awal robot saat halaman dimuat berasal dari `liveActivity(lifecycleStatus, runtimeStatus)`
(`app/game/agent-state.ts`): `thinking`/`working`/`waiting_approval` dari `runtimeStatus`, `idle` bila tidak ada run
aktif, `offline` bila agent tidak `active`. `runtimeStatusOfRun` di `domains/tasks/types.ts` memetakan status run →
status runtime (`queued`/`claimed` → `thinking`, `running` → `working`, `waiting_approval`).

## 2. Pemetaan event SSE → aksi game (`app/game/live-adapter.ts`)

`mapRealtimeEvent(event)` mengembalikan daftar `LiveGameAction` murni (tanpa DOM/Vue) yang diterapkan
`GameOffice.applyLiveAction` ke mesin (`OfficeEngine`) **hanya sebagai presentasi**; status bisnis selalu dibaca ulang
dari API (`liveRefresh`, `emit('resync')`).

| Event SSE                      | Aksi                | Presentasi di game                                                                                             |
| ------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ready`                        | `resync`, `confirm` | Muat ulang snapshot bila `replayed=false`; indikator "dikonfirmasi"                                            |
| `heartbeat`                    | `confirm`           | Perbarui waktu konfirmasi (RealtimeIndicator)                                                                  |
| `closed`                       | `closed`            | Ditangani `useOfficeRealtime` (revalidasi auth, reconnect bersyarat)                                           |
| `agent.task.created`           | `acknowledge`       | Balon "Perintah diterima: <judul>", state `thinking`                                                           |
| `agent.task.queued`            | `queued`            | State `thinking`                                                                                               |
| `agent.run.started`/`activity` | `work`              | Jalan ke stasiun rumah bila sedang di pulau lain, state kerja sesuai `workActivityFor(peran)`, balon aktivitas |
| `agent.run.waiting_approval`   | `wait_approval`     | State `waiting_approval`, balon "Hasil menunggu persetujuan."                                                  |
| `agent.run.completed`          | `complete`          | State `completed` 2 s → `idle`; balon "hasil tersedia" bila `released`                                         |
| `agent.run.failed`             | `fail`              | State `failed` 2,5 s → `thinking` bila `retryScheduled`, selain itu `idle`; balon kode error aman              |
| `agent.run.canceled`           | `cancel`            | State `idle`, balon "Tugas dibatalkan."                                                                        |
| `approval.requested`/`decided` | `task_changed`      | Muat ulang data tugas/persetujuan                                                                              |

Setiap aksi (kecuali `work`/`task_changed`) juga memicu `resync` agar panel dan roster membaca status terbaru. Event
untuk agent yang tidak ada di dunia (mis. diarsipkan) diabaikan.

## 3. Panel perintah (mode live)

- **Tugaskan** (`assign_task`) aktif hanya bila: runtime tersedia (`capabilities.runtime.available`), pengguna punya
  `tasks.create`, agent `active`, dan agent tidak sedang mengerjakan tugas. Alasan nonaktif ditampilkan apa adanya
  (`assignBlockedReason`), mis. "Runtime AI belum dikonfigurasi di server (AI_RUNTIME_PROVIDER)".
- Runtime `fixture` diberi label jujur **"Fixture (bukan AI)"** (`data-runtime-fixture-tag`); halaman `/tasks` juga
  menampilkan pemberitahuan fixture.
- Opsi **"Hasil perlu persetujuan manusia sebelum dirilis"** mengirim `requiresApproval: true`.
- Pengiriman memakai `idempotencyKey` acak per teks+opsi; percobaan ulang teks yang sama setelah error jaringan
  memakai kunci yang sama sehingga server mengembalikan tugas yang sama (`created: false`).
- Kartu tugas saat ini (`data-live-task`): status, percobaan, run, tombol **Batalkan** (`tasks.cancel`) dan
  **Lihat hasil** (hanya saat selesai dan dirilis), tautan detail `/tasks/:id`.
- Blok **Persetujuan dibutuhkan** (`data-live-approval`): tombol Setujui/Tolak hanya bila `approvals.decide`; selain
  itu teks "Butuh izin approvals.decide". Hasil tidak dapat dilihat sebelum dirilis (API 409
  `OUTPUT_PENDING_APPROVAL`).
- Error server ditampilkan sebagai `ApiError.message` (`data-live-error`); tidak ada eksekusi palsu saat gagal.
- `chat`, `pause`, `resume` tetap nonaktif (belum ada endpoint); `move` tetap presentasi lokal.

## 4. Pemisahan live vs pratinjau

| Aspek         | Pratinjau (SIMULASI)                                         | Live                                                                        |
| ------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Agent         | Tim Atlas (Nova/Sage/Pixel/Bolt/Echo) fiktif                 | Agent nyata tenant (`/agents`), nama tidak diubah                           |
| Instruksi     | Kata kunci menggerakkan `simulation.ts`, emit `instruct`     | `POST /tasks`, emit `assign`                                                |
| Persetujuan   | Kontrol simulasi berlabel SIMULASI (`data-approval-request`) | Data `agent_approvals` backend (`data-live-approval`)                       |
| Hasil         | Tidak ada                                                    | `GET /runs/:id/output` setelah dirilis                                      |
| Event         | Jam simulasi frontend                                        | SSE outbox                                                                  |
| Penulisan API | **Tidak pernah**                                             | Hanya `POST /tasks`, `POST /tasks/:id/cancel`, `POST /approvals/:id/decide` |

`AgentCommandPanel` mengabaikan prop `live` sepenuhnya saat `preview=true` (`const live = computed(() => props.preview
? null : props.live)`); `GameOffice.liveState` juga `null` di pratinjau. Diuji di `tests/nuxt/components.test.ts`
("Phase 5: panel live …") dan `tests/unit/live-adapter.test.ts`.

## 5. Sinkron ulang & ketahanan

- `ready.replayed=false` (celah > 500 event atau koneksi lama) → `resyncNeeded` → muat ulang `/agents` dan daftar
  tugas agent terpilih.
- Setelah `closed` (`TENANT_CHANGED`/`ACCESS_REVOKED`/…): `useAuth().revalidate()`; bila tenant berubah, cache
  `tenant:*` dibuang oleh `switchTenant()` dan halaman memuat data tenant baru.
- Setelah reload halaman, status robot dan kartu tugas dipulihkan dari API (QA: `afterReload.taskStatus = completed`).

## 6. Yang tidak dilakukan

- Tidak menampilkan progres persentase, biaya, atau "sedang mengetik" buatan; hanya status/aktivitas yang dikirim
  backend.
- Tidak membaca prompt/keluaran model dari SSE; hasil selalu lewat endpoint berizin.
- Tidak mengubah mesin game per frame dari Vue; aksi live hanya memanggil `setActivity`/`moveTo`/`say` yang
  diproses loop `requestAnimationFrame` tunggal.
