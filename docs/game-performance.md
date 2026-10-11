# Performa Virtual Office

Renderer DOM/SVG dipertahankan (evaluasi PixiJS: `docs/character-animation-system.md` §5). Prinsip: satu loop
`requestAnimationFrame`, renderer menulis gaya DOM hanya bila berubah, snapshot Vue hanya pada event diskret,
efek workstation dirender per snapshot (bukan per frame), animasi CSS hanya `transform`/`opacity` di compositor
layer, tanpa filter blur per frame.

## 1. Metode

Skrip puppeteer (scratchpad, bukan repo) terhadap **build production** (`.output`, port 4123), Chrome headless
(GPU Metal), viewport 1672×941, mode pratinjau. Per skenario: FPS dari `data-fps` panggung (sampel tiap 0,5 s),
frame terburuk `data-worst-frame-ms`, dan CDP `Performance.getMetrics` (durasi skrip/style/layout/task per detik,
heap JS, jumlah node DOM). Skenario: kantor siaga (ambient aktif) · lima robot bergerak (perintah dari panel) ·
lima robot bekerja (10 efek workstation) · simulasi fase 2 (jalan + portal) · simulasi penuh · zoom & geser ·
seleksi robot & panel. Pertumbuhan heap diukur dari awal sampai akhir seluruh skenario (±2 menit).

## 2. Hasil (11 Oktober 2026, Apple M2, daya listrik)

CPU 1×:

| Skenario                             | FPS min / median | Frame terburuk | Style ms/dtk | Skrip ms/dtk | Task ms/dtk | Node DOM |
| ------------------------------------ | ---------------: | -------------: | -----------: | -----------: | ----------: | -------: |
| Siaga (ambient aktif)                |          60 / 60 |          17 ms |         37,3 |          3,1 |        98,5 |    2 271 |
| Lima robot bergerak (perintah panel) |          60 / 60 |          17 ms |         64,1 |          3,5 |       157,2 |    3 450 |
| Lima robot bekerja (10 efek menyala) |          60 / 60 |          17 ms |         36,7 |          2,3 |        96,4 |    3 421 |
| Simulasi fase 2 (jalan + portal)     |          60 / 60 |          17 ms |         45,0 |          2,9 |       132,0 |    3 359 |
| Simulasi penuh (34,4 dtk, 65 sampel) |          60 / 60 |              — |            — |            — |           — |        — |
| Zoom & geser kamera                  |          60 / 60 |          17 ms |         25,2 |          2,8 |        96,3 |    3 472 |
| Seleksi robot & panel                |          60 / 60 |          17 ms |         25,6 |          2,1 |       109,6 |    3 639 |

CPU diperlambat 4×:

| Skenario                             | FPS min / median | Frame terburuk | Style ms/dtk | Task ms/dtk |
| ------------------------------------ | ---------------: | -------------: | -----------: | ----------: |
| Siaga (ambient aktif)                |          59 / 60 |          33 ms |         41,5 |       131,6 |
| Lima robot bergerak (perintah panel) |          51 / 60 |         167 ms |        147,5 |       375,1 |
| Lima robot bekerja                   |          60 / 60 |          17 ms |         72,5 |       178,0 |
| Simulasi fase 2 (jalan + portal)     |          60 / 60 |          17 ms |         88,3 |       253,4 |
| Simulasi penuh                       |          59 / 60 |              — |            — |           — |
| Zoom & geser kamera                  |          54 / 60 |         117 ms |         60,1 |       222,8 |
| Seleksi robot & panel                |          57 / 60 |          67 ms |         64,3 |       275,4 |

Lainnya: waktu muat aset sampai semua gambar selesai 318 ms (1×) / 398 ms (4×); heap JS 9–13 MB, pertumbuhan
+3,2 MB (1×) / +3,0 MB (4×) sepanjang seluruh skenario (tidak ada kebocoran yang terlihat); node DOM maks 3 639.

Frame terburuk pada 4× (167 ms "lima robot bergerak", 117 ms zoom) terjadi saat panel perintah dibuka/ditutup
dan toast muncul — recalculation style dari HUD (shadcn-vue/backdrop-blur), bukan dari loop game; FPS median tetap 60.

## 3. Pengukuran ulang build final (catatan kejujuran)

Pengukuran ulang pada build final (setelah perubahan kecil posisi panel hologram dan slot Mission Hub) dilakukan
saat laptop berjalan **di baterai 19 %**: compositor Chrome headless terkunci di 30 Hz (`requestAnimationFrame`
30,5 Hz bahkan pada `about:blank`), sehingga semua skenario menunjukkan 30/30 FPS dengan frame terburuk 34 ms.
Biaya main-thread pada build final sama atau lebih rendah dari tabel di atas (siaga 73,7 ms/dtk, bergerak
143,9, bekerja 87,7, fase 2 117,7, zoom 92,6, seleksi 92,0; heap +3,4 MB), jadi aplikasi bukan pembatasnya.
Angka 60 FPS di atas adalah hasil terisolasi pada build dengan loop game yang identik.

## 4. Kebijakan reduced motion

Dengan `prefers-reduced-motion: reduce`: `moveTo` tiba seketika (tanpa jalan/teleport/orb), semua animasi
karakter diam di frame 0, tidak ada perilaku ambient, animasi CSS `motion-safe:` mati, efek workstation dan
state/label tetap ditampilkan, kontrol simulasi tetap berfungsi. Diverifikasi di browser pada build final
(emulasi media): simulasi Project Atlas tuntas 19,1 dtk, 0 overlay ambient, frame idle tidak berubah, efek fase 4
tetap ada, 0 galat konsol (`docs/frontend-visual-qa.md`).

## 5. Kapan dievaluasi ulang

Lebih dari ±40 aktor animasi bersamaan, efek partikel berat per frame, peta tile besar dengan scrolling, atau FPS
median < 50 pada perangkat target pada daya listrik. Kontrak mesin tidak bergantung pada DOM, sehingga renderer lain
dapat ditambahkan sebagai implementasi `renderStates()` tanpa mengubah dunia/simulasi.
