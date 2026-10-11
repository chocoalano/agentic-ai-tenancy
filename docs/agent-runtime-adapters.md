# AI Runtime Interface & Adapter

Eksekusi tugas agent dilakukan worker melalui antarmuka runtime yang dapat diganti (`api/core/runtime/`). Dokumen
ini menjelaskan kontraknya, tiga adapter yang ada, konfigurasi, batas eksekusi, dan apa yang **tidak** diberikan
kepada model.

**Status:**

| Adapter             | Status                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `none`              | VERIFIED COMPLETE — `POST /tasks` menolak 409 `RUNTIME_NOT_CONFIGURED`; UI menampilkan alasan jujur                                         |
| `fixture`           | VERIFIED COMPLETE — deterministik, berlabel "BUKAN HASIL MODEL AI", **ditolak di production**                                               |
| `openai-compatible` | IMPLEMENTED BUT NOT VERIFIED end-to-end — tidak ada kredensial penyedia di lingkungan pengembangan ini (BLOCKED sampai kredensial tersedia) |

Tidak ada SDK penyedia yang ditambahkan; adapter memakai `fetch` bawaan Bun ke endpoint HTTP yang didokumentasikan.

## 1. Kontrak (`api/core/runtime/types.ts`)

```ts
interface AgentRuntime {
  readonly provider: string // 'none' | 'fixture' | 'openai-compatible'
  readonly model: string
  readonly available: boolean // false → tugas nyata tidak dapat dibuat
  readonly kind: 'real' | 'fixture' | 'none'
  execute(input: RuntimeInput): AsyncIterable<RuntimeEvent>
}
```

`RuntimeInput` berisi: identitas agent (nama, peran, instruksi utama dari tabel `agents`), judul & instruksi tugas,
`limits` (`timeoutMs`, `maxOutputChars`, `maxOutputTokens`, `temperature`), dan `signal` (`AbortSignal` dari worker
untuk pembatalan/lease hilang/shutdown).

`RuntimeEvent` yang boleh dihasilkan adapter:

| `type`      | Isi                                                    | Dipakai worker untuk                                                                        |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `started`   | `provider`, `model`, `providerRequestId?`              | event `agent.run.started`, kolom `provider_request_id`                                      |
| `activity`  | `activity` (deskripsi tingkat tinggi, bukan penalaran) | `agent_run_events` + event `agent.run.activity`                                             |
| `output`    | `outputType` (`text`/`markdown`), `content`            | `agent_run_outputs` (dipotong ke `maxOutputChars` → gagal `OUTPUT_TOO_LARGE` bila melebihi) |
| `usage`     | `inputTokens`, `outputTokens` (boleh `null`)           | kolom `usage_*` run — **hanya bila provider melaporkan**                                    |
| `completed` | `providerRequestId?`                                   | transisi run/tugas `completed`/`waiting_approval`                                           |
| `failed`    | `code` (`RunErrorCode`), `message` aman, `retryable`   | transisi `failed` + keputusan percobaan ulang                                               |

Adapter tidak boleh melempar exception untuk kegagalan yang dapat diprediksi; ia menghasilkan `failed` dengan kode
dari `RUN_ERROR_CODES` (`domains/tasks/types.ts`) dan pesan dari `RUN_ERROR_MESSAGES`. Pesan mentah penyedia tidak
diteruskan ke klien (hanya ke log server tanpa kredensial).

## 2. Adapter

### `none` (default)

`available = false`. Service tugas menolak pembuatan tugas dengan 409 `RUNTIME_NOT_CONFIGURED`; endpoint
`GET /tasks/capabilities` mengembalikan `runtime.available=false` sehingga panel perintah menonaktifkan **Tugaskan**
dengan alasan "Runtime AI belum dikonfigurasi di server (AI_RUNTIME_PROVIDER)". Tidak ada jalur eksekusi palsu.

### `fixture` (hanya development/test)

Deterministik: keluaran dibentuk dari nama agent, peran, dan instruksi, diawali
`[FIXTURE DETERMINISTIK — BUKAN HASIL MODEL AI]`, dengan beberapa event `activity` beruntun agar alur worker, SSE,
dan animasi dapat diuji. `kind = 'fixture'` membuat UI menampilkan label "Fixture (bukan AI)" dan pemberitahuan di
`/tasks`. `loadApiConfig()` **menolak** `AI_RUNTIME_PROVIDER=fixture` bila `NODE_ENV=production`
(`SERVICE_MISCONFIGURED`). Usage token selalu `null` (tidak ada yang bisa dilaporkan).

### `openai-compatible` (DigitalOcean Serverless Inference)

Memanggil `POST {AI_RUNTIME_BASE_URL}/chat/completions` dengan header `Authorization: Bearer <AI_RUNTIME_API_KEY>`
dan body `{ model, messages: [system, user], max_completion_tokens, temperature }` tanpa streaming. System prompt
disusun dari identitas agent (nama, peran, instruksi utama tenant) + batasan format; instruksi tugas menjadi pesan
`user`. Respons `choices[0].message.content` menjadi `output`; `usage.prompt_tokens`/`completion_tokens` menjadi
`usage` bila ada; `id` respons menjadi `providerRequestId`.

Klasifikasi kegagalan:

| Kondisi                                    | `code`                      | `retryable` |
| ------------------------------------------ | --------------------------- | :---------: |
| HTTP 429                                   | `PROVIDER_RATE_LIMITED`     |      ✓      |
| HTTP 408 / 504, atau `AbortSignal.timeout` | `PROVIDER_TIMEOUT`          |      ✓      |
| HTTP ≥ 500, kegagalan jaringan             | `PROVIDER_UNAVAILABLE`      |      ✓      |
| HTTP 4xx lainnya (401/403/400/404)         | `PROVIDER_REJECTED`         |      —      |
| Body bukan JSON / tanpa `choices`          | `PROVIDER_INVALID_RESPONSE` |      —      |
| Keluaran > `AI_MAX_OUTPUT_CHARS`           | `OUTPUT_TOO_LARGE`          |      —      |
| `signal` dibatalkan worker                 | `CANCELED`                  |      —      |

Percobaan ulang untuk kode `retryable` ditangani worker (run baru, `attempt + 1`, sampai `AI_RUN_MAX_ATTEMPTS`).

## 3. Konfigurasi

| Variabel                     | Default | Keterangan                                                                                                    |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `AI_RUNTIME_PROVIDER`        | `none`  | `none` \| `fixture` \| `openai-compatible`; `fixture` ditolak di production                                   |
| `AI_RUNTIME_BASE_URL`        | —       | Wajib untuk `openai-compatible`, harus `https://` (DigitalOcean: `https://inference.do-ai.run/v1`)            |
| `AI_RUNTIME_API_KEY`         | —       | Wajib untuk `openai-compatible`; **tidak pernah** di-log, dikirim ke klien, atau masuk `runtimeConfig.public` |
| `AI_RUNTIME_MODEL`           | —       | Wajib untuk `openai-compatible`; nama model sesuai katalog penyedia                                           |
| `AI_RUNTIME_TIMEOUT_SECONDS` | `120`   | 5–900; batas satu panggilan model                                                                             |
| `AI_RUNTIME_TEMPERATURE`     | `0.2`   | 0–2                                                                                                           |
| `AI_MAX_INSTRUCTION_CHARS`   | `4000`  | 50–8000; instruksi lebih panjang ditolak 422 `INSTRUCTION_TOO_LONG` saat `POST /tasks`                        |
| `AI_MAX_OUTPUT_CHARS`        | `20000` | 200–200000; keluaran lebih panjang → run gagal `OUTPUT_TOO_LARGE`                                             |
| `AI_MAX_OUTPUT_TOKENS`       | `1024`  | 16–32000; `max_completion_tokens`                                                                             |

Validasi dilakukan saat startup oleh `loadApiConfig()`; kesalahan membuat gerbang kesiapan menjawab 503
`SERVICE_MISCONFIGURED` (fail-closed) dan worker mandiri keluar dengan kode 1.

### Langkah menyiapkan DigitalOcean Serverless Inference

1. Di DigitalOcean → **GenAI Platform** → **Serverless Inference**, buat **model access key**.
2. Pilih nama model dari katalog model serverless DigitalOcean (nilai persisnya mengikuti daftar di konsol/dokumentasi
   DigitalOcean saat Anda membuatnya; jangan menebak).
3. Isi `.env` server API **dan** worker (keduanya memuat `loadApiConfig()`):

   ```bash
   AI_RUNTIME_PROVIDER=openai-compatible
   AI_RUNTIME_BASE_URL=https://inference.do-ai.run/v1
   AI_RUNTIME_API_KEY=<model access key>
   AI_RUNTIME_MODEL=<nama model dari katalog>
   ```

4. Jalankan `bun run worker` (atau `AI_WORKER_INLINE=true` untuk proses tunggal), buat tugas, lalu verifikasi
   `GET /api/v1/runs/:id` menampilkan `runtimeProvider = openai-compatible`, `providerRequestId`, dan `usage` dari
   penyedia. Sebelum langkah ini berhasil dijalankan, status skenario penyedia nyata tetap **BLOCKED**.

## 4. Yang tidak diberikan kepada model

- Tidak ada akses database, jaringan, sistem berkas, atau shell: adapter hanya mengirim teks dan menerima teks.
- Tidak ada tool/function calling; keluaran model **tidak pernah** dieksekusi sebagai perintah.
- Tidak ada data tenant lain: prompt hanya memuat identitas agent tenant tersebut dan instruksi tugas.
- Tidak ada kredensial di prompt, log, event SSE, atau respons API.
- Tidak ada progres/biaya buatan: UI hanya menampilkan `usage` yang dilaporkan penyedia (atau `null`).

## 5. Menambah adapter baru

1. Buat `api/core/runtime/<nama>.ts` yang mengembalikan `AgentRuntime` dengan `kind: 'real'`; implementasikan
   `execute` sebagai async generator yang menghormati `input.signal` dan `input.limits`, dan memetakan kegagalan ke
   `RunErrorCode` (jangan melempar pesan mentah).
2. Daftarkan nilai provider di `AI_PROVIDERS` (`api/core/config/env.ts`) beserta validasi variabel wajibnya, dan
   di `createAgentRuntime` (`api/core/runtime/index.ts`).
3. Dokumentasikan variabel di `.env.example` dan tabel di atas.
4. Uji dengan server HTTP tiruan di test integrasi bila memungkinkan; jangan menandai skenario penyedia nyata
   VERIFIED tanpa kredensial dan eksekusi sebenarnya.
