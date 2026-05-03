# FileConcat Development Tasks

Bu klasor, FileConcat projesinin gelistirme gorevlerini atomik ve sirali sekilde dokumante eder.

## Task Listesi

### Faz 1: TanStack Start Migration (Yuksek Oncelik)

| #   | Task                                                                                                | Bagimlilik | Tahmini Sure |
| --- | --------------------------------------------------------------------------------------------------- | ---------- | ------------ |
| 01  | [TanStack Start Dependencies](./01-tanstack-start-dependencies/task-tanstack-start-dependencies.md) | -          | 30 dk        |
| 02  | [TanStack Start Config](./02-tanstack-start-config/task-tanstack-start-config.md)                   | 01         | 1 saat       |
| 03  | [Root Route Olusturma](./03-tanstack-start-root-route/task-tanstack-start-root-route.md)            | 02         | 2 saat       |
| 04  | [Index Route (Ana Sayfa)](./04-tanstack-start-index-route/task-tanstack-start-index-route.md)       | 03         | 2 saat       |
| 05  | [Static Pages (About, 404)](./05-tanstack-start-static-pages/task-tanstack-start-static-pages.md)   | 04         | 1 saat       |

**Faz 1 Toplam: ~6.5 saat**

### Faz 2: AI Model Data Entegrasyonu (Yuksek Oncelik)

| #   | Task                                                                                        | Bagimlilik | Tahmini Sure |
| --- | ------------------------------------------------------------------------------------------- | ---------- | ------------ |
| 06  | [Model Types Tanimlama](./06-models-dev-types/task-models-dev-types.md)                     | -          | 1 saat       |
| 07  | [Build-Time Fetch Script](./07-models-dev-build-script/task-models-dev-build-script.md)     | 06         | 1 saat       |
| 08  | [Server Function (API)](./08-models-dev-server-function/task-models-dev-server-function.md) | 06, 03     | 1.5 saat     |
| 09  | [UI Entegrasyonu](./09-models-dev-ui-integration/task-models-dev-ui-integration.md)         | 07, 08     | 3 saat       |

**Faz 2 Toplam: ~6.5 saat**

### Faz 3: Multi-Source Repository Destegi (Orta Oncelik)

| #   | Task                                                                                       | Bagimlilik | Tahmini Sure |
| --- | ------------------------------------------------------------------------------------------ | ---------- | ------------ |
| 10  | [Source Adapter Interface](./10-source-adapter-interface/task-source-adapter-interface.md) | -          | 1 saat       |
| 11  | [GitHub Adapter Refactor](./11-github-adapter-refactor/task-github-adapter-refactor.md)    | 10         | 1.5 saat     |
| 12  | [GitLab Adapter](./12-gitlab-adapter/task-gitlab-adapter.md)                               | 10         | 1.5 saat     |
| 13  | [Bitbucket Adapter](./13-bitbucket-adapter/task-bitbucket-adapter.md)                      | 10         | 1.5 saat     |
| 14  | [Gist/Snippet Adapter](./14-gist-adapter/task-gist-adapter.md)                             | 10         | 1 saat       |
| 15  | [URL Adapter](./15-url-adapter/task-url-adapter.md)                                        | 10         | 1 saat       |
| 16  | [Unified Source Input UI](./16-unified-source-input-ui/task-unified-source-input-ui.md)    | 10-15      | 2 saat       |

**Faz 3 Toplam: ~9.5 saat**

### Faz 4: UX Iyilestirmeleri (Orta Oncelik)

| #   | Task                                                                              | Bagimlilik | Tahmini Sure |
| --- | --------------------------------------------------------------------------------- | ---------- | ------------ |
| 17  | [Source Auto-Detection](./17-source-auto-detection/task-source-auto-detection.md) | 16         | 1 saat       |
| 18  | [Recent Sources History](./18-recent-sources/task-recent-sources.md)              | 16         | 1.5 saat     |
| 19  | [Cost Estimation Enhancement](./19-cost-estimation/task-cost-estimation.md)       | 09         | 1.5 saat     |

**Faz 4 Toplam: ~4 saat**

### Faz 5: Documentation & SEO (Dusuk Oncelik)

| #   | Task                                                                     | Bagimlilik | Tahmini Sure |
| --- | ------------------------------------------------------------------------ | ---------- | ------------ |
| 20  | [MDX Documentation Setup](./20-mdx-docs-setup/task-mdx-docs-setup.md)    | Faz 1      | 3 saat       |
| 21  | [SEO Metadata & Structured Data](./21-seo-metadata/task-seo-metadata.md) | Faz 1      | 2 saat       |

**Faz 5 Toplam: ~5 saat**

---

## Toplam Tahmini Sure

| Faz                             | Sure           |
| ------------------------------- | -------------- |
| Faz 1: TanStack Start Migration | 6.5 saat       |
| Faz 2: AI Model Data            | 6.5 saat       |
| Faz 3: Multi-Source             | 9.5 saat       |
| Faz 4: UX Iyilestirmeleri       | 4 saat         |
| Faz 5: Documentation & SEO      | 5 saat         |
| **TOPLAM**                      | **~31.5 saat** |

## Baslama Rehberi

1. **Faz 1'den baslayin** - Tum diger fazlar TanStack Start migration'a bagimli
2. **Faz 2 ve 3 paralel yapilabilir** - Farkli alanlarda calisiyorlar
3. **Faz 4 ve 5 en sona birakilabilir** - Nice-to-have ozellikler

## Task Formati

Her task dosyasi su bolumlerden olusur:

- **Ozet**: Task'in kisa aciklamasi
- **Oncelik**: Yuksek / Orta / Dusuk
- **Bagimliliklar**: Oncesinde tamamlanmasi gereken task'lar
- **Basari Kriterleri**: Task'in tamamlanmis sayilmasi icin gerekli kontroller
- **Detayli Adimlar**: Adim adim implementation rehberi
- **Test Etme**: Task'i test etme adimlari
- **Notlar**: Dikkat edilmesi gereken noktalar
- **Rollback**: Task basarisiz olursa geri alma adimlari

## Notlar

- Her task atomik ve bagimsiz test edilebilir sekilde tasarlanmistir
- Bagimliliklara dikkat edin - sirali calismayi saglar
- Her task tamamlandiginda commit atilmasi onerilir
- Test adimlarini mutlaka takip edin

## Katkida Bulunma

Task'larda hata veya eksiklik bulursaniz, issue aciniz veya PR gonderiniz.
