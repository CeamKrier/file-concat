# UX Karar Dosyası: Doğrulama döngüsü + Maliyet imza anı

> **Tarih:** 2026-06-18
> **Durum:** Kısmen geri alındı (2026-06-19). **Preview akışı (Scope A) revert edildi** — düşük değer bulundu; `preview-modal.tsx` yine ölü kod. **Kalan:** XML escape fix (shipped + testli) ve cost-moment fit okuması + ActionBar multi-part dürtmesi (Scope B). Sonraki adım kritik analiz: `docs/ux/2026-06-19-value-flow-critique-jumpstart.md`.
> **Hedef session komutu:** `/impeccable craft` (bu dosyayı oku, sonra uygula). Register: `product`.
> **Bu dosya bir brief'tir, kod değildir.** Kararlar kilitli; aşağıdaki doğrulanmış gerçekler tekrar keşfedilmek zorunda değil.

## Bağlam

FileConcat'in çekirdek vaadi (PRODUCT.md): "yerel dosyaları al, token maliyetini gör, kopyala, çık, hepsi bir dakikada, hiçbir şey makineden çıkmadan." Duygusal hedef: **"ne göndereceğimi tam olarak biliyorum."**

Kritik analiz sonucu: giriş ve filtreleme katmanı sağlam, ama **"göndermeden önce blob'u gör" anı yok** ve ürünün imza farklılaştırıcısı olan maliyet anı kısık sesle duruyor. İlke #1 (şeffaflıkla güven) ve ilke #5 (niyet anında ifade) ile gerçek affordance'lar arasında boşluk var.

## Kilitlenen kararlar

1. **Öncelik: Doğrulama döngüsü** önce kapatılacak.
2. **Maliyet/token anının tonu: İfadeli imza anı.** İlke #5 doğrultusunda renk, sığma uyarısı ve model penceresine göre rehberlik. Restraint marka için sapma değil; ifade yalnızca bu ana ayrılır (neon/maksimalizm değil).

## Scope: Bu session'da yapılacak

### A. Çıktı önizlemeyi ana akışa bağla
- `apps/web/src/components/preview-modal.tsx` zaten tam çalışır bir "Output Preview" modali (sekmeli, multi-part destekli) ama **hiçbir yerde import edilmiyor; ölü kod.** Bunu canlandır.
- `apps/web/src/components/action-bar.tsx`'e bir "Önizle / Preview" eylemi ekle (Copy ve Download'ın yanına). Mevcut buton dilini bozma; aynı affordance vokabüleri.
- Önizleme içeriği `apps/web/src/hooks/use-output-generation.ts`'ten gelen birleşmiş çıktı olmalı (single ise tek sekme "Output", multi-part ise "Part N" sekmeleri; modal zaten bunu destekliyor).
- Modal a11y: Esc ile kapanma, focus trap, görünür focus state. (Radix Dialog tabanı bunu büyük ölçüde sağlıyor, doğrula.)

### B. Maliyet anını imza anına çevir
- Şu an token = ActionBar'da düz bir sayı + `token-section.tsx`'te model seçici + `cost-estimate.tsx`. Karar anındaki rehberlik yok.
- Seçili modele göre **bağlam penceresine sığma rehberliği** ekle: "240K / 1M'e sığar" veya "128K GPT-4o'yu aşıyor, multi-part'a geç" gibi. Renk yalnızca burada devreye girer (sığar = nötr/olumlu, aşıyor = uyarı; renk tek sinyal olmasın, ikon/metin de olsun).
- Multi-part önerisi şu an `action-bar.tsx` options popover'ında gömülü; bu öneriyi karar anında görünür yere taşı.
- `cost-comparison.tsx`'in mevcut yeteneklerini bu session başında denetle (bu oturumda tam denetlenmedi); rehberliği sıfırdan yazmak yerine var olanı öne çıkar.

## Out of scope (bilinçli olarak yapılMAyacak)

- **Çalışma dosyalarını localStorage'a kalıcılaştırma.** Hard-reload'da setin gitmesi muhtemelen kasıtlı gizlilik kararı; marka ilkesiyle çelişir. Dokunma.
- Aşağıdaki "ertelenen" maddeler bu session'a sokulmayacak (kapsam dağılmasın).

## Ertelenen (sonraki session'lar, ayrı brief)

- **Ölçekte seçim:** file-tree'de isim araması + tümünü seç / hiçbiri / tersine çevir toplu eylemler. (P1, ikinci sıradaki kaldıraç.)
- **Klavye hızlandırıcıları:** cmd/ctrl+C ile blob kopyalama, dosya toggle kısayolları. (P2, CLI power-user personası.)
- **`window.confirm("Discard unsaved changes?")`** (`app.tsx:306`) → in-app dialog. (P3, a11y + marka tutarlılığı.)
- **ARIA hardening:** file-tree ve modal'da ARIA ince; taahhüt edilen WCAG AA tabanı için ayrı harden geçişi. (P3.)

## Doğrulanmış gerçekler (yeniden keşfetme)

- `preview-modal.tsx` mevcut ve eksiksiz; `app.tsx` / `action-bar.tsx` / `use-output-generation.ts`'in hiçbirinde referansı yok (grep boş). Sadece bağlanması gerekiyor, sıfırdan yazmak gerekmiyor.
- Kalıcılık sanıldığından zengin: `staged-files-provider` sessionStorage; config / recent-sources / model / output-ratio localStorage'da. Eksik olan sadece /app çalışma setinin hard-reload restorasyonu (ve bu kasıtlı).
- Kaynak sekmesi sayısı 5 (github, gitlab, bitbucket, gist, ham URL), 3 değil.
- Tek klavye davranışı: `file-tree/tree-node-row.tsx`'te Enter/Space.

## Marka kısıtları (uygula)

- Em dash yok. Her section'a eyebrow yok. Aynı boyutlu kart grid'i yok. Side-stripe border yok.
- İfade yalnızca maliyet anına; geri kalan yüzey sakin kalır (ilke #2, #5).
- Renk tek sinyal değil; durum için ikon/metin de.

## Done kriterleri

- [x] ActionBar'dan "Preview" ile birleşmiş çıktı (single ve multi-part) Kopyala/İndir öncesi görülebiliyor.
- [x] Önizleme modali Esc ile kapanıyor (Radix Dialog + onOpenChange), focus trap doğru, her iki temada AA kontrastı geçiyor.
- [x] Maliyet anı seçili modelin penceresine sığma durumunu net gösteriyor (ikon + cümle + marka-token'lı çubuk), multi-part önerisi karar anında görünür (ActionBar dürtmesi + fit panelinde "Use multi-part").
- [x] `pnpm check` ve `pnpm lint` temiz (yalnız 2 önceden var olan uyarı).
- [x] Out-of-scope maddelere dokunulmamış (sessionStorage/localStorage kalıcılık, hard-reload restorasyonu el değmedi).

> Yan keşif + düzeltme: Preview, XML stilinde `assembleOutput`'un dosya içeriğindeki `<`/`>`/`&`'i `&lt;`/`&gt;`/`&amp;`'e kaçırdığını görünür kıldı (`Record<T>` → `Record&lt;T&gt;`, `=>` → `=&gt;`). Kullanıcı onayıyla düzeltildi: içerik artık birebir (verbatim) yazılıyor; yalnız tag attribute'ları (path/language/project/source) kaçırılıyor. `<file>` etiketleri katı XML değil, LLM için sınırlayıcı. `escapeXmlText` kaldırıldı; `output.test.ts` yeni sözleşmeyi kilitliyor (10 test, hepsi geçiyor). CLI de aynı motoru kullandığı için tutarlı.
>
> Ayrı (bu session'da değil): `tests/dedup.test.ts` `canonicalModelKey` idempotency property testi fast-check rastgele tohumuyla nadiren patlıyor (latent, output işiyle ilgisiz).

## Sonraki session'da çalıştır

```
/impeccable craft çıktı önizleme akışı + maliyet imza anı
```
Komut çalışınca önce bu dosyayı (`docs/ux/2026-06-18-verification-loop-and-cost-moment.md`) okut.
