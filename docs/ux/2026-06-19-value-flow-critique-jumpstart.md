# Jumpstart: Değer + Akış Kritiği (mevcut özellikler, sıfır yeni özellik)

> **Tarih:** 2026-06-19
> **Nasıl kullanılır:** Yeni bir session'da bu dosyayı okut, sonra başla. Bu bir görev brief'idir, kod değil.
> **Tek cümlelik niyet:** FileConcat /app'in mevcut yetenekleri, **en yüksek faydayı en düşük kullanıcı eforuyla** versin diye kritik incele; yeni özellik ekleme.

## Amaç

Kullanıcının işi: "N yerel dosyayı tek, token-sayımlı, LLM'e yapıştırılabilir bloba çevir; bir dakikadan az sürede; hiçbir şey makineden çıkmadan." Nihai hedef her zaman: **kullanıcı en az tıklama / karar / okuma ile bu işi bitirsin.**

Bu session yeni özellik aramaz. Sorusu: mevcut özellikler etkin, erişilebilir ve keşfedilebilir mi? Nerede kullanıcı eforu, ürettiği değerden fazla? En ucuz düzeltme ne?

## Çıktı (bu session ne üretmeli)

1. **Açık bir mental model / çerçeve.** Akıştaki her adım için: kullanıcı ne *değer* alıyor · ne *efor* harcıyor (tıklama, karar, bilişsel yük, okuma) · oran optimal mi · en ucuz iyileştirme ne. Önce çerçeveyi kur, sonra uygula. Çerçeve yeniden kullanılabilir olsun (sonraki kararlar da bununla tartılsın).
2. **Önceliklendirilmiş friction / erişim / keşfedilebilirlik kritiği.** Kanıta dayalı (kod davranışı + akış), spekülasyon değil. Her bulgu: nerede, neden efor/değer dengesizliği, hangi mevcut yetenek gizli/yanlış yerde.
3. **Düşük-efor / yüksek-değer düzeltme listesi** — yeni özellik olmadan. Yüksek-güven olanları (kesin kazanç) spekülatiften (ölçüm gerektirir) ayır.

## Kısıtlar

- **Yeni özellik yok.** Önce var olanı etkin ve görünür kıl. Çözüm "ekle" değil, çoğu zaman "yerini değiştir / varsayılanı düzelt / adım çıkar."
- **Gizlilik markası dokunulmaz** (PRODUCT.md ilke #1: dosya bırakınca network yok, hesap yok).
- **Ölçüme bağımlı olma.** Bu, first-principles heuristik kritik. Analytics kararı bilinçli parklandı (bkz. [[feedback-focus-net-value]]); bulguların metrik olmadan da savunulabilir olsun, ya da "bunu doğrulamak ölçüm ister" diye açıkça işaretle.

## İncelenecek akış (uçtan uca yürü, her adımı ayrı tart)

`land → source input (5 remote: github/gitlab/bitbucket/gist/raw URL + drop/browse) → ingest → file-tree + filter-rail (presets, include/ignore globs, manual override) → token/cost (model seçici, output ratio slider, cost estimate, "Compare All Models" dialog) → output (single/multi, XML/MD, chunk size) → copy/download.`

Her adımda sor: Bu gizli mi? Kaç tıklama/karar gerektiriyor? Varsayılan doğru mu (kullanıcı hiç dokunmadan iyi sonuç alıyor mu)? Kullanıcı ne işe yaradığını anlıyor mu? Hiç kullanılıyor olabilir mi, yoksa ölü ağırlık mı? En ucuz düzeltme ne?

## Doğrulanmış gerçekler (yeniden keşfetme, zaman harcama)

- `MULTI_OUTPUT_LIMIT = 100_000` **keyfi**: ilk init commit'inde (`b5babcc`), yorum/gerekçe yok, seçili modelden bağımsız sabit — oysa katalogdaki modellerin çoğu 128K–2M tutuyor. "100K üstü multi öner" dürtmesi buna yaslanıyor → şüpheyle bak, muhtemel kaldırma/yeniden tanımlama adayı.
- single/multi + XML/MD + chunk size kontrolleri ActionBar'daki **Options popover'ında gizli** — kullanıcı geri-bildiriminde "kolay erişilemiyor" diye işaretlendi. Bilinen friction; format kararı blob'un şeklini belirleyen birincil karar ama popover ardında.
- **Cost moment** (TokenSection): model-fit okuması (ikon + cümle + marka-token'lı çubuk) + ActionBar'da multi-part dürtmesi bu oturumda kaldı. Soru açık: cost/token bölümünü kullanıcı gerçekten kullanıyor mu, yoksa çoğu "drop → copy" mi? (Metriksiz: en azından adımın eforunu/yerini tart.)
- **Preview reverted** (düşük değer bulundu). `apps/web/src/components/preview-modal.tsx` yeniden ölü/orphan kod; tamamen silinebilir.
- XML çıktı artık dosya içeriğini **verbatim** yazıyor (escape fix shipped + testli).
- Kalıcılık: staged-files sessionStorage; config / recent-sources / model / output-ratio localStorage. /app çalışma seti hard-reload'da **kasıtlı** kaybolur (gizlilik kararı, dokunma).
- **Hiç kullanım metriği yok** (tamamen client-side, backend log yok). Bu yüzden bazı "kullanılıyor mu" soruları metriksiz kesinleşmez — onları ayrı işaretle.

## Önerilen başlangıç (tooling)

- `critical-analysis` skill: değer tezini ve mental modeli stres-testle (gizli varsayımlar, "bu adım gerçekten değer üretiyor mu" adversaryal geçiş).
- `/impeccable critique apps/web/src/app.tsx akışı`: UX/flow heuristik puanlama geçişi (erişim, hiyerarşi, bilişsel yük, keşfedilebilirlik).
- İkisini birleştir: önce çerçeve → sonra kritik → sonra düşük-efor kazanımlar.

## Başlamadan netleşmeli (1 soru)

"Net değer"in bu session'daki önceliği ne — **hız** (drop→copy en kısa yol), **doğruluk/şeffaflık** (token & cost güveni), yoksa **gizlilik güveni** mi? PRODUCT.md üçünü de söylüyor; mental model hepsini tartar ama önceliği bilmek friction kesintilerinde hangi tarafa düşeceğini belirler.
